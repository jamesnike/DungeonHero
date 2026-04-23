/**
 * 淬炼冲击 (overkill-upgrade) & 混沌冲击 (chaos-strike) — overkill bonus must
 * fire ONLY when the spell actually deals more damage than the target's current
 * layer HP, AFTER all reducer-side mitigation:
 *
 *   1. 诅咒碑光环 (`stacked-magic-immune`)        → 0 damage, no overkill bonus
 *   2. 虫盾 (`swarmBugletShield` + buglet)    → 0 damage, no overkill bonus
 *   3. 抗性 (`spellDamageReduction`)          → halved (min 1) — may cancel overkill
 *   4. 护体 (`maxDamagePerHit`)               → capped — may cancel overkill
 *
 * Bug: previously the resolvers used `rawDamage > monster.hp` to decide whether
 * to enqueue `SET_UPGRADE_MODAL_OPEN` (overkill-upgrade) / `DRAW_FROM_BACKPACK`
 * (chaos-strike). Because `DEAL_DAMAGE_TO_MONSTER` short-circuits / mitigates
 * inside the reducer, the bonus could fire even when the monster took 0 damage,
 * producing player-visible "造成 4 伤害，超杀！选择一张牌升级" against a Marble
 * Golem standing on a 诅咒碑.
 *
 * Fix: shared `computeEffectiveSpellDamageOnMonster(state, monsterId, raw)`
 * mirrors the reducer's mitigation chain; both resolvers now compare the
 * MITIGATED damage to current layer HP before queueing the bonus.
 *
 * If a new spell-damage mitigation is added to `reduceDealDamageToMonster`,
 * the helper MUST be updated in lock-step or these tests will start lying.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import { initialCombatState } from '../constants';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeOverkillCard(idSuffix = 'ou') {
  // Damage = 3 + amplifyBonus (1) = 4.
  return {
    id: `magic-overkill-${idSuffix}`,
    type: 'magic' as const,
    name: '淬炼冲击',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '造成 3 点伤害，超杀升级一张牌。',
    description: '永久：对一个怪物造成 3 点伤害。超杀：升级一张牌。',
    knightEffect: 'overkill-upgrade',
    recycleDelay: 1,
    amplifyBonus: 1,
  };
}

function makeChaosStrikeCard(idSuffix = 'cs') {
  // Damage = 3 + amplifyBonus (1) = 4.
  return {
    id: `magic-chaos-${idSuffix}`,
    type: 'magic' as const,
    name: '混沌冲击',
    value: 0,
    image: '',
    magicType: 'instant' as const,
    magicEffect: '对一个怪物造成 3 点伤害。超杀：抽 2 张牌。(可超手牌上限)',
    description: '对一个怪物造成 3 点伤害。超杀：抽 2 张牌。(可超手牌上限)',
    amplifyBonus: 1,
  };
}

function makeMonster(id: string, name: string, hp: number, extras: Record<string, unknown> = {}) {
  return {
    id,
    type: 'monster' as const,
    name,
    value: hp,
    hp,
    maxHp: hp,
    attack: 5,
    ...extras,
  };
}

function makeBuglet(id: string) {
  return {
    id,
    type: 'monster' as const,
    name: 'Buglet',
    value: 1,
    hp: 1,
    maxHp: 1,
    attack: 1,
    isBuglet: true,
  };
}

function makeCurseStele(id = 'curse-stele-1') {
  return {
    id,
    type: 'building' as const,
    name: '诅咒碑',
    value: 1,
    buildingAura: 'stacked-magic-immune' as const,
  };
}

function activeRow(...cards: (ReturnType<typeof makeMonster> | null)[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

function findMonster(state: GameState, id: string): { hp?: number } | undefined {
  return state.activeCards.find(c => c?.id === id) as { hp?: number } | undefined;
}

function backpackHasGoldDraw(state: GameState): { drawnCount: number } {
  // chaos-strike's overkill enqueues DRAW_FROM_BACKPACK count: 2. Assert by
  // counting cards that ended up in hand vs backpack drop.
  return { drawnCount: state.handCards.length };
}

// ---------------------------------------------------------------------------
// 淬炼冲击 (overkill-upgrade)
// ---------------------------------------------------------------------------

describe('淬炼冲击 (overkill-upgrade) overkill-bonus mitigation', () => {
  it('curse stele aura: no upgrade modal, no overkill log, monster unharmed', () => {
    const card = makeOverkillCard('immune');
    const golem = makeMonster('golem-1', 'Marble Golem', 3);
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(golem),
      activeCardStacks: { 0: [makeCurseStele()] as any },
      combatState: { ...initialCombatState, engagedMonsterIds: ['golem-1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('overkill-upgrade');

    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'golem-1' } as GameAction],
    );

    expect(findMonster(result.state, 'golem-1')?.hp).toBe(3);
    expect(result.state.upgradeModalOpen).toBeFalsy();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('免疫魔法伤害')),
    ).toBeDefined();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeUndefined();
  });

  it('swarm buglet shield (with buglet on field): no upgrade modal, no overkill log', () => {
    const card = makeOverkillCard('buglet');
    const swarmer = makeMonster('swarmer-1', 'Swarm Lord', 3, { swarmBugletShield: true });
    const buglet = makeBuglet('buglet-1');
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(swarmer, buglet),
      combatState: { ...initialCombatState, engagedMonsterIds: ['swarmer-1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'swarmer-1' } as GameAction],
    );

    expect(findMonster(result.state, 'swarmer-1')?.hp).toBe(3);
    expect(result.state.upgradeModalOpen).toBeFalsy();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('虫盾')),
    ).toBeDefined();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeUndefined();
  });

  it('spellDamageReduction 50%: 4 raw → 2 mitigated, NOT enough to overkill 3 hp', () => {
    const card = makeOverkillCard('resist');
    const wraith = makeMonster('wraith-1', 'Wraith', 3, { spellDamageReduction: 0.5 });
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(wraith),
      combatState: { ...initialCombatState, engagedMonsterIds: ['wraith-1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'wraith-1' } as GameAction],
    );

    // Reducer logged the resistance and applied 2 dmg.
    expect(findMonster(result.state, 'wraith-1')?.hp).toBe(1);
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('抗性')),
    ).toBeDefined();
    // 2 dmg ≤ 3 hp → NOT overkill; modal must stay closed.
    expect(result.state.upgradeModalOpen).toBeFalsy();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeUndefined();
  });

  it('maxDamagePerHit 5 cap: 8 dmg capped to 5, NOT enough to overkill 7 hp', () => {
    // Use upgraded amp to push raw dmg to 8 (3 base + 5 amp).
    const card = { ...makeOverkillCard('cap'), amplifyBonus: 5 };
    const golem = makeMonster('elite-golem', 'Elite Marble Golem', 7, { maxDamagePerHit: 5 });
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(golem),
      combatState: { ...initialCombatState, engagedMonsterIds: ['elite-golem'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'elite-golem' } as GameAction],
    );

    // 8 → capped to 5 → hp 7-5=2; not killed.
    expect(findMonster(result.state, 'elite-golem')?.hp).toBe(2);
    expect(result.state.upgradeModalOpen).toBeFalsy();
  });

  it('negative control: no mitigation, 4 dmg overkills 3 hp → upgrade modal opens', () => {
    const card = makeOverkillCard('plain');
    const golem = makeMonster('golem-2', 'Plain Golem', 3);
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(golem),
      combatState: { ...initialCombatState, engagedMonsterIds: ['golem-2'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'golem-2' } as GameAction],
    );

    expect(result.state.upgradeModalOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 混沌冲击 (chaos-strike)
// ---------------------------------------------------------------------------

describe('混沌冲击 (chaos-strike) overkill-bonus mitigation', () => {
  it('curse stele aura: no DRAW_FROM_BACKPACK, monster unharmed, no overkill log', () => {
    const card = makeChaosStrikeCard('immune');
    const golem = makeMonster('golem-cs-1', 'Marble Golem', 3);
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(golem),
      activeCardStacks: { 0: [makeCurseStele()] as any },
      combatState: { ...initialCombatState, engagedMonsterIds: ['golem-cs-1'], currentTurn: 'hero' },
    });

    const handBefore = backpackHasGoldDraw(state).drawnCount; // = 1 (just the chaos-strike card)

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('chaos-strike');

    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'chaos-strike', monsterId: 'golem-cs-1' } as GameAction],
    );

    expect(findMonster(result.state, 'golem-cs-1')?.hp).toBe(3);
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('免疫魔法伤害')),
    ).toBeDefined();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeUndefined();
    // No overkill bonus draw — hand should NOT have grown by 2 from backpack.
    // (chaos-strike consumes itself so hand shrinks by 1; +2 draw would mean +1 net.
    // We assert no net positive growth.)
    expect(result.state.handCards.length).toBeLessThanOrEqual(handBefore);
  });

  it('swarm buglet shield (with buglet on field): no draw bonus, monster unharmed', () => {
    const card = makeChaosStrikeCard('buglet');
    const swarmer = makeMonster('swarmer-cs', 'Swarm Lord', 3, { swarmBugletShield: true });
    const buglet = makeBuglet('buglet-cs');
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(swarmer, buglet),
      combatState: { ...initialCombatState, engagedMonsterIds: ['swarmer-cs'], currentTurn: 'hero' },
    });

    const handBefore = state.handCards.length;
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'chaos-strike', monsterId: 'swarmer-cs' } as GameAction],
    );

    expect(findMonster(result.state, 'swarmer-cs')?.hp).toBe(3);
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('虫盾')),
    ).toBeDefined();
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeUndefined();
    expect(result.state.handCards.length).toBeLessThanOrEqual(handBefore);
  });

  it('spellDamageReduction 50%: 4 raw → 2 mitigated, NOT enough to overkill 3 hp', () => {
    const card = makeChaosStrikeCard('resist');
    const wraith = makeMonster('wraith-cs', 'Wraith', 3, { spellDamageReduction: 0.5 });
    const state = makeState({
      handCards: [card] as any,
      activeCards: activeRow(wraith),
      combatState: { ...initialCombatState, engagedMonsterIds: ['wraith-cs'], currentTurn: 'hero' },
    });

    const handBefore = state.handCards.length;
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'chaos-strike', monsterId: 'wraith-cs' } as GameAction],
    );

    expect(findMonster(result.state, 'wraith-cs')?.hp).toBe(1);
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeUndefined();
    expect(result.state.handCards.length).toBeLessThanOrEqual(handBefore);
  });

  it('negative control: 4 dmg overkills 3 hp → DRAW_FROM_BACKPACK fires', () => {
    const card = makeChaosStrikeCard('plain');
    const golem = makeMonster('golem-cs-2', 'Plain Golem', 3);
    // Stock the backpack with cards so the draw can actually fetch something.
    const backpackCards = [
      { id: 'bp-1', type: 'magic' as const, name: 'Filler 1', value: 0 },
      { id: 'bp-2', type: 'magic' as const, name: 'Filler 2', value: 0 },
      { id: 'bp-3', type: 'magic' as const, name: 'Filler 3', value: 0 },
    ];
    const state = makeState({
      handCards: [card] as any,
      backpackItems: backpackCards as any,
      activeCards: activeRow(golem),
      combatState: { ...initialCombatState, engagedMonsterIds: ['golem-cs-2'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'chaos-strike', monsterId: 'golem-cs-2' } as GameAction],
    );

    // Overkill: 2 backpack cards drawn into hand.
    expect(result.state.handCards.length).toBeGreaterThanOrEqual(2);
    expect(
      result.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('超杀')),
    ).toBeDefined();
  });
});
