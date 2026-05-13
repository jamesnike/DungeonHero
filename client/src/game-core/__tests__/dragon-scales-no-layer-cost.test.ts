/**
 * Dragon Scales (龙鳞) — `dragonAttackNoLayerCost` activation lifecycle.
 *
 * Card text: 「上回合掉过血层时，本次攻击不消耗血层」
 *
 * Bug regression (the reason this file exists):
 *   `reduceDecrementFury` (`rules/combat.ts`) gates 龙鳞 on the runtime flag
 *   `dragonNoLayerCostActive`. Historically that flag was declared on
 *   `GameCardData` and READ at attack time, but **never WRITTEN anywhere** —
 *   so the gate was always false and every dragon attack drained a layer
 *   regardless of whether the hero had damaged it that turn.
 *
 *   Fix: `endHeroTurnPatch` (`combat.ts`) latches `dragonNoLayerCostActive`
 *   on every engaged dragon at the end of each hero turn based on whether
 *   that dragon's id is in the `heroTurnLayerLossIds` set passed in by
 *   `END_TURN`. The flag is NOT cleared on attack — lifecycle is
 *   re-evaluated every hero turn end.
 *
 * Coverage matrix:
 *
 *   1. Engaged dragon that lost a layer this hero turn  → flag = true
 *   2. Engaged dragon that did NOT lose a layer         → flag = false
 *   3. Stale-flag clear: previously true, no damage now → flag = false
 *   4. Elite dragon (`eliteHealOtherMonster`) ALSO gets the flag updated
 *      — the elite-skill branch in the existing forEach loop early-returns,
 *      so the flag update must run in a separate loop (regression target)
 *   5. Non-engaged dragon: NOT in attack queue → flag not touched
 *   6. Monster without `dragonAttackNoLayerCost` is unaffected
 *
 * Plus end-to-end coverage at `DECREMENT_FURY`:
 *
 *   7. Flag = true → currentLayer unchanged on attack (the actual no-layer-
 *      cost behavior)
 *   8. Flag = false → currentLayer decremented normally (control)
 *   9. All-free semantics: flag persists across attack, so a hypothetical
 *      double-attack monster turn keeps both attacks free
 *
 * Test fixtures use `phase: 'playerInput'` to match real gameplay rather than
 * the misleading `'idle'` default of `createInitialGameState()`. See
 * `.cursor/rules/pipeline-input-continuation.mdc`.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { endHeroTurnPatch } from '../combat';
import type { GameState } from '../types';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    ...overrides,
  };
}

function activeRowOf(...monsters: Array<GameCardData | null>): ActiveRowSlots {
  const row: Array<GameCardData | null> = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function makeDragon(overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'd1',
    type: 'monster' as const,
    name: 'Dragon',
    value: 4,
    image: '',
    hp: 6,
    maxHp: 6,
    attack: 4,
    currentLayer: 2,
    fury: 2,
    hpLayers: 2,
    dragonAttackNoLayerCost: true,
    ...overrides,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1-6: endHeroTurnPatch flag activation
// ---------------------------------------------------------------------------

describe('endHeroTurnPatch — dragonNoLayerCostActive activation', () => {
  it('engaged dragon that lost a layer this hero turn → flag set true', () => {
    const dragon = makeDragon({ id: 'd1', currentLayer: 1 });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = endHeroTurnPatch(state, new Set([dragon.id]));
    const after = result.activeCards[0] as GameCardData;
    expect(after.dragonNoLayerCostActive).toBe(true);
  });

  it('engaged dragon that did NOT lose a layer → flag set false (or stays false)', () => {
    const dragon = makeDragon({ id: 'd1', currentLayer: 2 });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = endHeroTurnPatch(state, new Set<string>());
    const after = result.activeCards[0] as GameCardData;
    expect(after.dragonNoLayerCostActive ?? false).toBe(false);
  });

  it('stale-flag clear: dragon had flag=true from last turn, no damage this turn → flag cleared', () => {
    const dragon = makeDragon({ id: 'd1', currentLayer: 2, dragonNoLayerCostActive: true });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = endHeroTurnPatch(state, new Set<string>());
    const after = result.activeCards[0] as GameCardData;
    expect(after.dragonNoLayerCostActive).toBe(false);
  });

  it('elite dragon — dragon-flag update runs even when eliteHealOtherMonster branch early-returns', () => {
    // Regression target: elite dragon (`eliteHealOtherMonster`) AND
    // (`dragonAttackNoLayerCost`) on the same monster. The eliteHealOther
    // branch in the existing `engagedMonsters.forEach` loop hits `return;`
    // when it heals an ally, which would silently skip the dragon-flag
    // update if it lived inside the same loop. Verifying that scenario:
    //
    //   - heroTurnLayerLossIds is EMPTY for the dragon → eliteHealOther FIRES
    //     and early-returns from the forEach loop (heals the ally)
    //   - dragon's flag must be (re)set to false by our SEPARATE loop after
    //
    // If our update lived inside the existing forEach, the early-return from
    // eliteHealOther would skip it and a stale `dragonNoLayerCostActive: true`
    // from a previous turn would persist forever.
    const allyId = 'ally1';
    const ally: GameCardData = {
      id: allyId,
      type: 'monster' as const,
      name: 'Ally',
      value: 4,
      image: '',
      hp: 3,
      maxHp: 6,
      attack: 4,
      currentLayer: 1,
      fury: 2,
      hpLayers: 2,
    } as GameCardData;
    const eliteDragon = makeDragon({
      id: 'eliteD',
      eliteHealOtherMonster: true,
      currentLayer: 2,
      // Stale flag from an earlier turn that we expect this end-of-hero-turn
      // to clear, despite the eliteHealOther early-return.
      dragonNoLayerCostActive: true,
    });
    const state = makeState({
      activeCards: activeRowOf(eliteDragon, ally),
      combatState: { ...initialCombatState, engagedMonsterIds: [eliteDragon.id, allyId] },
    });
    // heroTurnLayerLossIds is EMPTY → eliteHealOther fires (gate satisfied)
    // → forEach early-returns for the dragon → dragon-flag update must
    // STILL run in the separate loop and clear the stale flag.
    const result = endHeroTurnPatch(state, new Set<string>());

    // Sanity: eliteHealOther actually fired — ally got healed (+1 layer).
    // This proves the elite branch DID early-return.
    const allyAfter = result.activeCards[1] as GameCardData;
    expect(allyAfter.currentLayer).toBe(2);

    // Critical: dragon's stale flag was still cleared by the separate loop.
    const dragonAfter = result.activeCards[0] as GameCardData;
    expect(dragonAfter.dragonNoLayerCostActive).toBe(false);
  });

  it('non-engaged dragon: not in attack queue → flag not touched', () => {
    // A dragon that's on the active row but NOT in engagedMonsterIds will
    // never reach DECREMENT_FURY this monster turn anyway (only engaged
    // monsters attack). Skipping it avoids unnecessary writes.
    const dragon = makeDragon({ id: 'nonEngagedD', currentLayer: 2 });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      // dragon NOT engaged
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });
    const result = endHeroTurnPatch(state, new Set<string>());
    const after = result.activeCards[0] as GameCardData;
    // Flag stays at original value (undefined → undefined), not forcibly cleared
    expect(after.dragonNoLayerCostActive).toBeUndefined();
  });

  it('monster without dragonAttackNoLayerCost is unaffected', () => {
    const skeleton: GameCardData = {
      id: 'sk1',
      type: 'monster' as const,
      name: 'Skeleton',
      value: 3,
      image: '',
      hp: 3,
      maxHp: 3,
      attack: 3,
      currentLayer: 1,
    } as GameCardData;
    const state = makeState({
      activeCards: activeRowOf(skeleton),
      combatState: { ...initialCombatState, engagedMonsterIds: [skeleton.id] },
    });
    const result = endHeroTurnPatch(state, new Set([skeleton.id]));
    const after = result.activeCards[0] as GameCardData;
    expect(after.dragonNoLayerCostActive).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7-9: end-to-end via DECREMENT_FURY
// ---------------------------------------------------------------------------

describe('DECREMENT_FURY × 龙鳞 — end-to-end', () => {
  it('flag=true: dragon attack does NOT consume a layer (the bug fix)', () => {
    const dragon = makeDragon({
      id: 'd1',
      currentLayer: 1,
      dragonNoLayerCostActive: true,
    });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id });
    const after = result.state.activeCards[0] as GameCardData;
    expect(after.currentLayer).toBe(1); // ← unchanged: 龙鳞 absorbed the cost
    // No defeat enqueued (would have been if dragon dropped from layer 1 → 0)
    expect(result.enqueuedActions.some(a => a.type === 'MONSTER_DEFEATED')).toBe(false);
  });

  it('flag=false: dragon attack consumes a layer normally (control)', () => {
    const dragon = makeDragon({
      id: 'd1',
      currentLayer: 2,
      dragonNoLayerCostActive: false,
    });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id });
    const after = result.state.activeCards[0] as GameCardData;
    expect(after.currentLayer).toBe(1);
  });

  it('flag missing entirely (undefined): dragon attack consumes a layer normally', () => {
    // This is the pre-fix observed behavior in real gameplay — flag was never
    // set so it was undefined, gate failed, attack drained a layer. We pin
    // it as a control to make sure the gate logic itself didn't drift.
    const dragon = makeDragon({ id: 'd1', currentLayer: 2 });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id });
    const after = result.state.activeCards[0] as GameCardData;
    expect(after.currentLayer).toBe(1);
  });

  it('all-free semantics: flag persists across attack so multi-attack still free', () => {
    // Hypothetical future double-attack elite dragon. The contract per the
    // user-confirmed design: 龙鳞 covers the WHOLE monster turn, not just the
    // first hit. So the flag must survive a DECREMENT_FURY call.
    const dragon = makeDragon({
      id: 'd1',
      currentLayer: 1,
      dragonNoLayerCostActive: true,
    });
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const after1 = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id });
    const dragonAfter1 = after1.state.activeCards[0] as GameCardData;
    expect(dragonAfter1.dragonNoLayerCostActive).toBe(true); // NOT cleared
    expect(dragonAfter1.currentLayer).toBe(1);

    // Second attack same monster turn — still free.
    const after2 = reduce(after1.state, { type: 'DECREMENT_FURY', monsterId: dragon.id });
    const dragonAfter2 = after2.state.activeCards[0] as GameCardData;
    expect(dragonAfter2.currentLayer).toBe(1);
  });

  it('stunned dragon does NOT skip the layer cost even with flag set (existing gate)', () => {
    // Pre-existing condition `!monster.isStunned` in the dragon-flag branch.
    // Pin it so a future refactor doesn't accidentally break the stun
    // interaction (Ogre 击晕, etc.).
    const dragon = makeDragon({
      id: 'd1',
      currentLayer: 2,
      dragonNoLayerCostActive: true,
      isStunned: true,
    } as Partial<GameCardData>);
    const state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });
    const result = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id });
    const after = result.state.activeCards[0] as GameCardData;
    expect(after.currentLayer).toBe(1); // layer cost paid normally
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: END_TURN + DECREMENT_FURY (the user-reported scenario)
// ---------------------------------------------------------------------------

describe('END_TURN → DECREMENT_FURY — user-reported regression', () => {
  it('hero damages dragon (lose layer) → end turn → dragon attack does not lose another layer', () => {
    // Setup: dragon at currentLayer=1 (already lost one this hero turn from
    // the player's attack). engagedMonsterIds includes the dragon.
    // heroTurnLayerLossIds carries the dragon's id (the GameBoard side-effect
    // listener tracks this in real gameplay).
    const dragon = makeDragon({
      id: 'd1',
      currentLayer: 1,
      hp: 6,
      // dragonNoLayerCostActive deliberately undefined to simulate fresh card
    });
    const stateBeforeEnd = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });

    // Step 1: END_TURN with the dragon in heroTurnLayerLossIds → flag must
    // be latched true so the next monster-turn attack benefits from 龙鳞.
    const afterEnd = reduce(stateBeforeEnd, {
      type: 'END_TURN',
      heroTurnLayerLossIds: [dragon.id],
    });
    const dragonAfterEnd = afterEnd.state.activeCards[0] as GameCardData;
    expect(dragonAfterEnd.dragonNoLayerCostActive).toBe(true);
    expect(dragonAfterEnd.currentLayer).toBe(1);

    // Step 2: dragon attacks (DECREMENT_FURY fires after the player resolves
    // the block). Layer must NOT decrement — that's the entire bug.
    const afterAttack = reduce(afterEnd.state, {
      type: 'DECREMENT_FURY',
      monsterId: dragon.id,
    });
    const dragonAfterAttack = afterAttack.state.activeCards[0] as GameCardData;
    expect(dragonAfterAttack.currentLayer).toBe(1); // still alive!
    expect(
      afterAttack.enqueuedActions.some(a => a.type === 'MONSTER_DEFEATED'),
    ).toBe(false);
  });

  it('lifecycle: damage → free → no-damage → costs again', () => {
    // Multi-turn lifecycle: verify the flag is re-evaluated each end-of-hero-
    // turn rather than persisting forever (which would let dragon attack for
    // free indefinitely after a single layer loss).
    const dragon = makeDragon({ id: 'd1', currentLayer: 2, fury: 3, hpLayers: 3 });
    let state = makeState({
      activeCards: activeRowOf(dragon),
      combatState: { ...initialCombatState, engagedMonsterIds: [dragon.id] },
    });

    // Turn 1: hero damages dragon (currentLayer 2→1 already simulated by
    // setting up state with currentLayer=2; we just signal the layer loss
    // via heroTurnLayerLossIds for clarity).
    state = reduce(state, {
      type: 'END_TURN',
      heroTurnLayerLossIds: [dragon.id],
    }).state;
    expect((state.activeCards[0] as GameCardData).dragonNoLayerCostActive).toBe(true);

    // Monster turn 1: dragon attacks → free.
    state = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id }).state;
    expect((state.activeCards[0] as GameCardData).currentLayer).toBe(2);

    // Reset combat state to back to hero turn (simplified — real game would
    // route through ADVANCE_MONSTER_TURN / START_TURN).
    state = {
      ...state,
      combatState: { ...state.combatState, currentTurn: 'hero', engagedMonsterIds: [dragon.id] },
    };

    // Turn 2: hero does NOT damage dragon → empty heroTurnLayerLossIds.
    state = reduce(state, {
      type: 'END_TURN',
      heroTurnLayerLossIds: [],
    }).state;
    expect((state.activeCards[0] as GameCardData).dragonNoLayerCostActive).toBe(false);

    // Monster turn 2: dragon attacks → costs layer normally.
    state = reduce(state, { type: 'DECREMENT_FURY', monsterId: dragon.id }).state;
    expect((state.activeCards[0] as GameCardData).currentLayer).toBe(1);
  });
});
