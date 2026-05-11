/**
 * 潮愈之符 (`waterfall-heal` amulet) — starter pool amulet.
 *
 * Behavior contract (current design):
 *   - Each equipped 潮愈之符 contributes ⌊recycleBagSize / 4⌋ HP at the start of
 *     `APPLY_WATERFALL_EFFECTS` (linear ×N stacking before the heal multiplier).
 *   - Recycle-bag size is sampled from the **pre-wash** snapshot — i.e. before
 *     `processRecycleBag` ticks `_recycleWaits` and pulls ready cards back to
 *     the backpack. This block runs in `reduceApplyWaterfallEffects` strictly
 *     before the recycle-bag tick, and we read `state.permanentMagicRecycleBag.length`
 *     directly from the input snapshot, so the timing is naturally pre-wash.
 *   - `reduceHeal` then applies the compound `2^healCount` multiplier from any
 *     equipped 治疗护符 (`amuletEffect: 'heal'`).
 *   - Independent of the relic 永恒护符·潮涌回春 (`waterfall-heal` relic) which
 *     still heals a flat 4 HP — a player with both gets two separate `HEAL`
 *     actions enqueued (additive, not multiplicative).
 *   - When `⌊recycleBagSize / 4⌋ * waterfallHealCount === 0`, no `HEAL` action is
 *     enqueued and no log line is emitted (silent no-op).
 *   - Heal is capped by `maxHp` via `computeHeal`, so over-heal is silently absorbed.
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from '../actions';
import '../card-schema';

// `maxHp` is computed (`INITIAL_HP + permanentMaxHpBonus + ...`); we lift it
// to 60 via `permanentMaxHpBonus: 40` so the test ceiling never accidentally
// caps a heal we expect to land in full.
function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    hp: 10,
    permanentMaxHpBonus: 40,
    ...overrides,
  };
}

const waterfallHealAmulet = (id: string) => ({
  id,
  type: 'amulet' as const,
  name: '潮愈之符',
  value: 0,
  amuletEffect: 'waterfall-heal' as const,
});

const healAmulet = (id: string) => ({
  id,
  type: 'amulet' as const,
  name: '治疗护符',
  value: 0,
  amuletEffect: 'heal' as const,
});

const waterfallHealRelic = {
  id: 'waterfall-heal',
  name: '永恒护符·潮涌回春',
  description: '',
  image: '',
};

// Build a generic permanent magic card to populate the recycle bag. `_recycleWaits`
// controls whether processRecycleBag will return it to the backpack on this tick:
//   waits=1 → tick to 0 → ready (returned to backpack this waterfall)
//   waits=2 → tick to 1 → still waiting
function recycleBagCard(id: string, waits = 2): GameCardData {
  return {
    id,
    type: 'magic',
    name: `回收袋测试卡-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 2,
    _recycleWaits: waits,
  } as GameCardData;
}

function bagOf(count: number, waits = 2): GameCardData[] {
  return Array.from({ length: count }, (_, i) => recycleBagCard(`bag-${i}`, waits));
}

describe('starter amulet: 潮愈之符 (waterfall-heal — recycle-bag-driven)', () => {
  it('1 amulet, empty recycle bag → no heal (silent no-op)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(10);
  });

  it('1 amulet, bag has 3 → ⌊3/4⌋=0 → no heal', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: bagOf(3),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(10);
  });

  it('1 amulet, bag has 4 → ⌊4/4⌋=1 → +1 HP', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: bagOf(4),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(11);
  });

  it('1 amulet, bag has 11 → ⌊11/4⌋=2 → +2 HP', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: bagOf(11),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(12);
  });

  it('2 amulets, bag has 4 → 2 × ⌊4/4⌋=2 → +2 HP (linear ×N stacking)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1'), waterfallHealAmulet('a2')] as any,
      permanentMagicRecycleBag: bagOf(4),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(12);
  });

  it('3 amulets, bag has 8 → 3 × ⌊8/4⌋=6 → +6 HP', () => {
    const state = makeState({
      amuletSlots: [
        waterfallHealAmulet('a1'),
        waterfallHealAmulet('a2'),
        waterfallHealAmulet('a3'),
      ] as any,
      permanentMagicRecycleBag: bagOf(8),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(16);
  });

  it('1 amulet + 1 heal-amulet, bag has 4 → ⌊4/4⌋=1, ×2^1 = +2 HP', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1'), healAmulet('h1')] as any,
      permanentMagicRecycleBag: bagOf(4),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(12);
  });

  it('2 amulets + 1 heal-amulet, bag has 4 → 2 × 1 × 2 = +4 HP', () => {
    const state = makeState({
      amuletSlots: [
        waterfallHealAmulet('a1'),
        waterfallHealAmulet('a2'),
        healAmulet('h1'),
      ] as any,
      permanentMagicRecycleBag: bagOf(4),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(14);
  });

  it('1 amulet + 2 heal-amulets, bag has 8 → 1 × 2 × 2^2 = +8 HP', () => {
    const state = makeState({
      amuletSlots: [
        waterfallHealAmulet('a1'),
        healAmulet('h1'),
        healAmulet('h2'),
      ] as any,
      permanentMagicRecycleBag: bagOf(8),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(18);
  });

  it('amulet + relic, bag has 4 → relic +4 HP, amulet +1 HP, total +5 (additive independent)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      eternalRelics: [waterfallHealRelic] as any,
      permanentMagicRecycleBag: bagOf(4),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(15);
  });

  it('amulet + relic + heal-mul, bag has 4 → relic 4×2 + amulet 1×2 = +10', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1'), healAmulet('h1')] as any,
      eternalRelics: [waterfallHealRelic] as any,
      permanentMagicRecycleBag: bagOf(4),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(20);
  });

  it('amulet + relic, empty bag → only relic heals (+4)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      eternalRelics: [waterfallHealRelic] as any,
      permanentMagicRecycleBag: [],
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(14);
  });

  it('no amulet, no relic → no heal triggered', () => {
    const state = makeState({
      amuletSlots: [] as any,
      eternalRelics: [] as any,
      permanentMagicRecycleBag: bagOf(8),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(10);
  });

  it('hp at maxHp → heal capped (silently absorbed)', () => {
    // maxHp = INITIAL_HP(20) + permanentMaxHpBonus(40) = 60.
    const state = makeState({
      hp: 60,
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: bagOf(8),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(60);
  });

  it('partial overflow → heal only fills to maxHp', () => {
    // 1 amulet + 1 heal-amulet, bag 16 → ⌊16/4⌋=4, ×2 = 8 base. hp 57 / max 60 → +3 capped.
    const state = makeState({
      hp: 57,
      amuletSlots: [waterfallHealAmulet('a1'), healAmulet('h1')] as any,
      permanentMagicRecycleBag: bagOf(16),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(60);
  });

  it('non-waterfall-heal amulets do not contribute', () => {
    const otherAmulet = {
      id: 'other',
      type: 'amulet' as const,
      name: '拾荒之符',
      value: 0,
      amuletEffect: 'dungeon-gold' as const,
    };
    const state = makeState({
      amuletSlots: [otherAmulet] as any,
      permanentMagicRecycleBag: bagOf(8),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // Critical timing test: heal calculation MUST sample the pre-wash recycle bag.
  // ---------------------------------------------------------------------------
  it('heal samples recycle-bag size BEFORE processRecycleBag washes ready cards back', () => {
    // 4 cards with _recycleWaits=1 → all become ready this tick → after
    // processRecycleBag the bag is empty. If we sampled post-wash, heal would
    // be 0; we expect +1 because the pre-wash size is 4.
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: bagOf(4, 1),
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(11);
    // Sanity check: the wash actually happened — bag is now empty and cards
    // were restored to the backpack.
    expect(result.state.permanentMagicRecycleBag.length).toBe(0);
    expect(result.state.backpackItems.length).toBeGreaterThanOrEqual(4);
  });

  it('heal samples pre-wash size with mixed waits (some ready, some still waiting)', () => {
    // 5 ready cards (waits=1) + 3 still waiting (waits=2) = 8 in bag pre-wash.
    // Heal should be ⌊8/4⌋ = 2. After processRecycleBag the bag has 3 left.
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      permanentMagicRecycleBag: [
        ...bagOf(5, 1).map(c => ({ ...c, id: `ready-${c.id}` })),
        ...bagOf(3, 2).map(c => ({ ...c, id: `wait-${c.id}` })),
      ],
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(12);
    // Only the 3 still-waiting cards remain in the bag (with waits decremented to 1).
    expect(result.state.permanentMagicRecycleBag.length).toBe(3);
  });
});
