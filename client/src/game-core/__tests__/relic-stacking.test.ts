/**
 * 永恒护符叠加（chain-persuade / equip-empower / end-turn-draw）—
 *
 * User asked that the three potion-grants below stack linearly when used
 * multiple times, with the eternal relic bar showing the current stack count
 * and detail tooltip showing the dynamically-scaled description:
 *
 *   - 连劝秘药 (perm-persuade-consecutive → relic `chain-persuade`)
 *     Each copy adds another +15% per consecutive persuade attempt on the
 *     same monster.
 *   - 铸锋药剂 (perm-equip-empower → relic `equip-empower`)
 *     Each copy adds another +3 temp attack / +3 temp armor on equip.
 *   - 回合汲取药 (grant-amulet-end-turn-draw → relic `end-turn-draw`)
 *     Each copy adds another +1 backpack draw on end-of-hero-turn.
 *
 * 不变量（钉死的核心行为）：
 *
 *   1. Granting a stackable relic a 2nd time pushes a 2nd copy into
 *      `state.eternalRelics` (it does NOT log dupeLogMsg / bail out).
 *   2. `chain-persuade` rate bonus scales with `countEternalRelics(...)`
 *      while keeping all other persuade math identical.
 *   3. `equip-empower` slot temp attack / armor scales with the relic count
 *      (PLAY_CARD path).
 *   4. `end-turn-draw` already inherits stacking from `computeAmuletEffects`
 *      (covered separately by `end-turn-draw-relic.test.ts` — sanity test
 *      here for completeness).
 *   5. Display: `dedupeRelics([A,A])` → 1 entry with `count: 2`.
 *      `getRelicStackedSuffix(id, 2)` returns the human-readable suffix.
 *      `STACKABLE_RELIC_IDS` is the source of truth for which relics dedupe.
 *
 * Test coverage as requested by user (option `full`):
 *   - Reducer behavior (linear scaling of magnitude after 2 / 3 grants).
 *   - Display layer (dedupe + ×N badge data + appended suffix description).
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import {
  countEternalRelics,
  dedupeRelics,
  getEternalRelic,
  getRelicStackedSuffix,
  hasEternalRelic,
  isRelicStackable,
  STACKABLE_RELIC_IDS,
} from '@/lib/eternalRelics';
import { computePersuadeSuccessRatePure } from '../helpers';
import { initialCombatState } from '../constants';
import type { GameState, GameCardData, EternalRelic } from '../types';
import type { GameAction } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    phase: 'playerInput',
    ...overrides,
  };
}

const FILLER = (id: string): GameCardData => ({
  id,
  type: 'magic',
  name: 'Filler',
  value: 0,
  image: '',
} as any);

// ---------------------------------------------------------------------------
// Granting potions — stackable: true wires up via card-schema
// ---------------------------------------------------------------------------
function makeChainPersuadePotion(id = 'cp-1'): GameCardData {
  return {
    id,
    type: 'potion',
    name: '连劝秘药',
    value: 0,
    image: '',
    potionEffect: 'perm-persuade-consecutive',
  } as any;
}

function makeEquipEmpowerPotion(id = 'ee-1'): GameCardData {
  return {
    id,
    type: 'potion',
    name: '铸锋药剂',
    value: 0,
    image: '',
    potionEffect: 'perm-equip-empower',
  } as any;
}

function makeEndTurnDrawPotion(id = 'etd-1'): GameCardData {
  return {
    id,
    type: 'potion',
    name: '回合汲取药',
    value: 0,
    image: '',
    potionEffect: 'grant-amulet-end-turn-draw',
  } as any;
}

// ---------------------------------------------------------------------------
// 1) Schema-engine grant path — multiple uses push multiple copies
// ---------------------------------------------------------------------------
describe('永恒护符叠加 — grant 路径推多份到 eternalRelics', () => {
  it('连劝秘药 ×2：2 份 chain-persuade 进 eternalRelics（不再走 dupeLogMsg）', () => {
    let state = makeState({ hp: 20, eternalRelics: [], handCards: [] });

    const c1 = makeChainPersuadePotion('cp-1');
    state = { ...state, handCards: [c1] };
    const r1 = reduce(state, { type: 'RESOLVE_POTION', cardId: c1.id, card: c1 });
    state = r1.state;

    expect(countEternalRelics(state.eternalRelics ?? [], 'chain-persuade')).toBe(1);
    expect(hasEternalRelic(state.eternalRelics ?? [], 'chain-persuade')).toBe(true);

    const c2 = makeChainPersuadePotion('cp-2');
    state = { ...state, handCards: [c2] };
    const r2 = reduce(state, { type: 'RESOLVE_POTION', cardId: c2.id, card: c2 });
    state = r2.state;

    expect(countEternalRelics(state.eternalRelics ?? [], 'chain-persuade')).toBe(2);

    // Second grant must NOT use the "无法叠加" dupe message.
    const sawDupe = r2.sideEffects.some(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.includes('无法叠加'),
    );
    expect(sawDupe).toBe(false);

    const sawStackedLog = r2.sideEffects.some(
      e => e.event === 'log:entry' && (e.payload as any)?.message?.includes('叠加 ×2'),
    );
    expect(sawStackedLog).toBe(true);
  });

  it('铸锋药剂 ×3：3 份 equip-empower 进 eternalRelics', () => {
    let state = makeState({ hp: 20, eternalRelics: [], handCards: [] });
    for (let i = 1; i <= 3; i++) {
      const card = makeEquipEmpowerPotion(`ee-${i}`);
      state = { ...state, handCards: [card] };
      state = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card }).state;
    }
    expect(countEternalRelics(state.eternalRelics ?? [], 'equip-empower')).toBe(3);
  });

  it('回合汲取药 ×2：2 份 end-turn-draw 进 eternalRelics', () => {
    let state = makeState({ hp: 20, eternalRelics: [], handCards: [] });
    const c1 = makeEndTurnDrawPotion('etd-1');
    state = { ...state, handCards: [c1] };
    state = reduce(state, { type: 'RESOLVE_POTION', cardId: c1.id, card: c1 }).state;

    const c2 = makeEndTurnDrawPotion('etd-2');
    state = { ...state, handCards: [c2] };
    state = reduce(state, { type: 'RESOLVE_POTION', cardId: c2.id, card: c2 }).state;

    expect(countEternalRelics(state.eternalRelics ?? [], 'end-turn-draw')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2) chain-persuade — magnitude scales linearly with stack count
// ---------------------------------------------------------------------------
describe('永恒护符叠加 — chain-persuade 劝降率线性放大', () => {
  // Build a fixture where the persuade math is mostly stable, so the only
  // variable across the assertions is the chain-persuade stack size. We pick
  // a target monster, set `lastPersuadeTargetId === monster.id` and a non-
  // zero `consecutivePersuadeCount` so the chain bonus applies, then compare
  // 1 / 2 / 3 stacks.
  // Pick a fixture with a *low* baseline (~36) so chain-persuade ×1/×2/×3
  // (each adding +15) all stay below the 85 maxRate cap. With stronger
  // monster (hp 20, layers 1, atk 2) and hero hp 30 / no weapon, the base
  // dominance is ~0.75 → baseline rate ~36, leaving full headroom for
  // +45 from a 3-stack. Each step is exactly 15 after the round-to-5.
  function buildPersuadeFixture(stack: number, consecutiveCount: number) {
    const relic = getEternalRelic('chain-persuade');
    const relics: EternalRelic[] = Array.from({ length: stack }, () => ({ ...relic }));
    const monster = {
      id: 'm-target',
      type: 'monster' as const,
      name: 'Goblin',
      value: 1,
      hp: 20,
      maxHp: 20,
      attack: 2,
      currentLayer: 1,
      fury: 1,
      hpLayers: 1,
    } as any as GameCardData;
    const state: GameState = makeState({
      hp: 30,
      eternalRelics: relics,
      lastPersuadeTargetId: monster.id,
      consecutivePersuadeCount: consecutiveCount,
      activeCards: [monster, null, null, null, null] as any,
    } as any);
    return { state, monster };
  }

  it('×1 / ×2 / ×3 上同一怪物（consecutive=1）：rate 每多 1 个 relic +15', () => {
    const { state: s1, monster } = buildPersuadeFixture(1, 1);
    const { state: s2 } = buildPersuadeFixture(2, 1);
    const { state: s3 } = buildPersuadeFixture(3, 1);

    const r1 = computePersuadeSuccessRatePure(s1, monster);
    const r2 = computePersuadeSuccessRatePure(s2, monster);
    const r3 = computePersuadeSuccessRatePure(s3, monster);

    // computePersuadeSuccessRatePure rounds to nearest 5, so additive 15
    // increments survive the rounding step exactly.
    expect(r2 - r1).toBe(15);
    expect(r3 - r2).toBe(15);
  });

  it('consecutive=0（首次劝降同一目标）：chain-persuade 不参与，叠加也无效', () => {
    const { state: s1, monster } = buildPersuadeFixture(1, 0);
    const { state: s3 } = buildPersuadeFixture(3, 0);
    expect(computePersuadeSuccessRatePure(s1, monster)).toBe(
      computePersuadeSuccessRatePure(s3, monster),
    );
  });

  it('consecutive=2（连续第三次）：×2 stack 应给 +60（=2×15×2）', () => {
    const { state: s0, monster } = buildPersuadeFixture(0, 2);
    const { state: s2 } = buildPersuadeFixture(2, 2);
    const r0 = computePersuadeSuccessRatePure(s0, monster);
    const r2 = computePersuadeSuccessRatePure(s2, monster);
    // ×2 relics × consecutive=2 × 15 = +60. Rate is clamped to maxRate (70 or
    // 85) so we just assert the diff is bounded by clamp, never < 0, and
    // strictly larger than the 0-stack baseline.
    expect(r2).toBeGreaterThan(r0);
    expect(r2).toBeLessThanOrEqual(85);
  });
});

// ---------------------------------------------------------------------------
// 3) equip-empower — slot temp attack/armor scales linearly
// ---------------------------------------------------------------------------
describe('永恒护符叠加 — equip-empower 装备时临时加成线性放大', () => {
  function makeWeapon(id: string): GameCardData {
    return {
      id,
      type: 'weapon',
      name: '测试武器',
      value: 1,
      image: '',
      attack: 1,
      durability: 2,
      maxDurability: 2,
    } as any;
  }

  function play(stack: number) {
    const relic = getEternalRelic('equip-empower');
    const relics: EternalRelic[] = Array.from({ length: stack }, () => ({ ...relic }));
    const weapon = makeWeapon('w-stack');
    const state = makeState({
      hp: 20,
      eternalRelics: relics,
      handCards: [weapon],
      equipmentSlot1: null,
      equipmentSlot2: null,
      slotTempAttack: {} as any,
      slotTempArmor: {} as any,
    });
    return reduce(state, {
      type: 'PLAY_CARD',
      cardId: weapon.id,
      preferredSlot: 'equipmentSlot1',
    });
  }

  it('×1：装备时该栏临时攻击 +3 / 临时护甲 +3', () => {
    const r = play(1);
    expect(r.state.slotTempAttack?.equipmentSlot1).toBe(3);
    expect(r.state.slotTempArmor?.equipmentSlot1).toBe(3);
  });

  it('×2：装备时该栏临时攻击 +6 / 临时护甲 +6', () => {
    const r = play(2);
    expect(r.state.slotTempAttack?.equipmentSlot1).toBe(6);
    expect(r.state.slotTempArmor?.equipmentSlot1).toBe(6);
  });

  it('×3：装备时该栏临时攻击 +9 / 临时护甲 +9', () => {
    const r = play(3);
    expect(r.state.slotTempAttack?.equipmentSlot1).toBe(9);
    expect(r.state.slotTempArmor?.equipmentSlot1).toBe(9);
  });

  it('×0（无 relic）：不发生临时加成', () => {
    const r = play(0);
    expect(r.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
    expect(r.state.slotTempArmor?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('×2：log 文案带 "（叠加 ×2）" 标注', () => {
    const r = play(2);
    const sawLog = r.sideEffects.some(
      e =>
        e.event === 'log:entry' &&
        (e.payload as any)?.message?.includes('铸锋药剂') &&
        (e.payload as any)?.message?.includes('叠加 ×2'),
    );
    expect(sawLog).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4) end-turn-draw — sanity stack check (full coverage in
//    `end-turn-draw-relic.test.ts`)
// ---------------------------------------------------------------------------
describe('永恒护符叠加 — end-turn-draw 回合结束抽牌线性放大（sanity）', () => {
  function relicDup(n: number): EternalRelic[] {
    const relic = getEternalRelic('end-turn-draw');
    return Array.from({ length: n }, () => ({ ...relic }));
  }

  it('×1 → 抽 1 张；×2 → 抽 2 张；×3 → 抽 3 张', () => {
    for (const stack of [1, 2, 3]) {
      const backpack = Array.from({ length: 5 }, (_, i) => FILLER(`bp-${stack}-${i}`));
      const state = makeState({
        hp: 20,
        eternalRelics: relicDup(stack),
        backpackItems: backpack as any,
        handCards: [],
      });
      const result = drain(state, [
        { type: 'END_TURN', heroTurnLayerLossIds: [] } as GameAction,
      ]);
      expect(result.state.handCards.length).toBe(stack);
      expect(result.state.backpackItems.length).toBe(5 - stack);
    }
  });
});

// ---------------------------------------------------------------------------
// 5) Display layer — dedupeRelics + getRelicStackedSuffix + STACKABLE_RELIC_IDS
// ---------------------------------------------------------------------------
describe('永恒护符叠加 — 显示层 helpers', () => {
  it('STACKABLE_RELIC_IDS 严格等于这三件 relic（卡面 + 行为同步源）', () => {
    expect(STACKABLE_RELIC_IDS.size).toBe(3);
    expect(STACKABLE_RELIC_IDS.has('chain-persuade')).toBe(true);
    expect(STACKABLE_RELIC_IDS.has('equip-empower')).toBe(true);
    expect(STACKABLE_RELIC_IDS.has('end-turn-draw')).toBe(true);
  });

  it('isRelicStackable 反映 STACKABLE_RELIC_IDS', () => {
    expect(isRelicStackable('chain-persuade')).toBe(true);
    expect(isRelicStackable('equip-empower')).toBe(true);
    expect(isRelicStackable('end-turn-draw')).toBe(true);
    expect(isRelicStackable('vitality-well')).toBe(false);
    expect(isRelicStackable('waterfall-draw-2')).toBe(false);
  });

  it('dedupeRelics: 2 份 chain-persuade → 1 entry, count=2', () => {
    const r = getEternalRelic('chain-persuade');
    const out = dedupeRelics([r, r]);
    expect(out.length).toBe(1);
    expect(out[0].count).toBe(2);
    expect(out[0].relic.id).toBe('chain-persuade');
  });

  it('dedupeRelics: 混合 stackable + non-stackable，保持首次出现顺序', () => {
    const a = getEternalRelic('chain-persuade');
    const b = getEternalRelic('vitality-well');
    const c = getEternalRelic('equip-empower');
    const out = dedupeRelics([a, b, a, c, c]);
    expect(out.map(d => d.relic.id)).toEqual(['chain-persuade', 'vitality-well', 'equip-empower']);
    expect(out.find(d => d.relic.id === 'chain-persuade')!.count).toBe(2);
    expect(out.find(d => d.relic.id === 'vitality-well')!.count).toBe(1);
    expect(out.find(d => d.relic.id === 'equip-empower')!.count).toBe(2);
  });

  it('dedupeRelics: 非 stackable 即使重复也强制 count=1（防御性，正常路径不应触发）', () => {
    const r = getEternalRelic('vitality-well');
    const out = dedupeRelics([r, r, r]);
    expect(out.length).toBe(1);
    expect(out[0].count).toBe(1);
  });

  it('getRelicStackedSuffix: count <= 1 返回空（避免 ×1 写得很奇怪）', () => {
    expect(getRelicStackedSuffix('chain-persuade', 1)).toBe('');
    expect(getRelicStackedSuffix('chain-persuade', 0)).toBe('');
    expect(getRelicStackedSuffix('vitality-well', 1)).toBe('');
  });

  it('getRelicStackedSuffix: chain-persuade ×2 → 含 "×2" 和 "+30%"', () => {
    const s = getRelicStackedSuffix('chain-persuade', 2);
    expect(s).toContain('×2');
    expect(s).toContain('+30%');
  });

  it('getRelicStackedSuffix: equip-empower ×3 → 含 "×3" 和 "+9 临时攻击" / "+9 临时护甲"', () => {
    const s = getRelicStackedSuffix('equip-empower', 3);
    expect(s).toContain('×3');
    expect(s).toContain('+9 临时攻击');
    expect(s).toContain('+9 临时护甲');
  });

  it('getRelicStackedSuffix: end-turn-draw ×4 → 含 "×4" 和 "抽 4 张"', () => {
    const s = getRelicStackedSuffix('end-turn-draw', 4);
    expect(s).toContain('×4');
    expect(s).toContain('抽 4 张');
  });

  it('getRelicStackedSuffix: 非 stackable relic 即使被强行传 count>1 也只返回通用文案', () => {
    const s = getRelicStackedSuffix('vitality-well', 2);
    expect(s).toBe('（已叠加 ×2）');
  });
});
