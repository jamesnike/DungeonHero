/**
 * 潮愈之符 (`waterfall-heal` amulet) — starter pool amulet.
 *
 * Behavior contract:
 *   - Each equipped 潮愈之符 contributes a base heal of 4 HP at the start of
 *     `APPLY_WATERFALL_EFFECTS` (linear ×N stacking before the heal multiplier).
 *   - `reduceHeal` then applies the compound `2^healCount` multiplier from any
 *     equipped 治疗护符 (`amuletEffect: 'heal'`), mirroring 永恒护符·潮涌回春.
 *   - Independent of the relic: a player with both the amulet and the eternal
 *     relic gets two separate `HEAL` actions enqueued (additive, not multiplicative).
 *   - Heal is capped by `maxHp` via `computeHeal`, so over-heal is silently absorbed.
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import '../card-schema';

// `maxHp` is computed (`INITIAL_HP + permanentMaxHpBonus + ...`); we lift it
// to 40 via `permanentMaxHpBonus: 20` so the test ceiling never accidentally
// caps a heal we expect to land in full.
function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    hp: 10,
    permanentMaxHpBonus: 20,
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

describe('starter amulet: 潮愈之符 (waterfall-heal)', () => {
  it('1 amulet, no heal-mul → +4 HP per waterfall', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(14);
  });

  it('2 amulets, no heal-mul → +8 HP per waterfall (linear ×N stacking)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1'), waterfallHealAmulet('a2')] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(18);
  });

  it('3 amulets, no heal-mul → +12 HP per waterfall', () => {
    const state = makeState({
      amuletSlots: [
        waterfallHealAmulet('a1'),
        waterfallHealAmulet('a2'),
        waterfallHealAmulet('a3'),
      ] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(22);
  });

  it('1 amulet + 1 heal-amulet → +8 HP (4 × 2^1)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1'), healAmulet('h1')] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(18);
  });

  it('2 amulets + 1 heal-amulet → +16 HP (8 × 2^1)', () => {
    const state = makeState({
      amuletSlots: [
        waterfallHealAmulet('a1'),
        waterfallHealAmulet('a2'),
        healAmulet('h1'),
      ] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(26);
  });

  it('1 amulet + 2 heal-amulets → +16 HP (4 × 2^2)', () => {
    const state = makeState({
      amuletSlots: [
        waterfallHealAmulet('a1'),
        healAmulet('h1'),
        healAmulet('h2'),
      ] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(26);
  });

  it('amulet + relic (no heal-mul) → +8 HP total (4 + 4, additive independent)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1')] as any,
      eternalRelics: [waterfallHealRelic] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(18);
  });

  it('amulet + relic + heal-mul → +16 HP total (4 × 2 + 4 × 2)', () => {
    const state = makeState({
      amuletSlots: [waterfallHealAmulet('a1'), healAmulet('h1')] as any,
      eternalRelics: [waterfallHealRelic] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(26);
  });

  it('no amulet, no relic → no heal triggered', () => {
    const state = makeState({
      amuletSlots: [] as any,
      eternalRelics: [] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(10);
  });

  it('hp at maxHp → heal is capped (silently absorbed)', () => {
    const state = makeState({
      hp: 40,
      amuletSlots: [waterfallHealAmulet('a1')] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(40);
  });

  it('partial overflow → heal only fills to maxHp', () => {
    // 1 amulet + 1 heal-amulet = 8 base heal. hp 35 / max 40 → +5 capped.
    const state = makeState({
      hp: 35,
      amuletSlots: [waterfallHealAmulet('a1'), healAmulet('h1')] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(40);
  });

  it('non-waterfall-heal amulets do not contribute', () => {
    // 拾荒之符 (`dungeon-gold`) is in the slot but should not heal.
    const otherAmulet = {
      id: 'other',
      type: 'amulet' as const,
      name: '拾荒之符',
      value: 0,
      amuletEffect: 'dungeon-gold' as const,
    };
    const state = makeState({
      amuletSlots: [otherAmulet] as any,
    });

    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);

    expect(result.state.hp).toBe(10);
  });
});
