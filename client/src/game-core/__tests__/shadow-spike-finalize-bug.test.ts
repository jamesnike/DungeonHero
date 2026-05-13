/**
 * 暗影之刺 (scaling-damage) — must go through FINALIZE_MAGIC_CARD on resolve.
 *
 * Bug: `case 'scaling-damage':` in `rules/hero.ts:reduceMagicMonsterSelection`
 *      directly enqueued `ADD_PERMANENT_MAGIC_TO_RECYCLE` to dispose the card,
 *      bypassing the `applyFinalizeMagic → FINALIZE_MAGIC_CARD` path that all
 *      other damage magic cards (奥术风暴 / 御甲破击 / 血祭裁决 / 混沌冲击 / etc.)
 *      use. As a result, when the player played 暗影之刺 against a Golem, the
 *      Golem's `antiMagicReflect` (反魔) reflect — which only fires inside
 *      `reduceFinalizeMagicCard` — was completely skipped.
 *
 * Same root cause also caused two other silent regressions:
 *   - `damageMagicPlayedThisTurn` counter never incremented on 暗影之刺 use,
 *     so 奥术护盾 (`arcane-shield-stun-cap`) treated it as a "non-damage magic"
 *     when computing 击晕上限 +X% on its turn.
 *   - `card:magicFinalized` side effect was not emitted, so any amulet listening
 *     on it (e.g. catapult / discard-zap / honor-blood downstream) saw nothing.
 *
 * Fix: route `case 'scaling-damage':` through `applyFinalizeMagic(...)`, mirroring
 * the structurally identical `case 'arcane-storm':` directly below it.
 *
 * This test asserts the full PLAY_CARD → RESOLVE_MAGIC_MONSTER_SELECTION chain
 * end-to-end (per `testing.mdc`): targets a Golem with antiMagicReflect=2 and
 * verifies all three regressions stay fixed.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { drainAutoReleasingFloats } from './_helpers';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(7),
    phase: 'playerInput',
    ...overrides,
  };
}

function makeShadowSpike(scalingDamage = 3): GameCardData {
  return {
    id: 'shadow-spike-1',
    type: 'magic',
    name: '暗影之刺',
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: '永久：对怪造成伤害；用后叠刺+1，回回收袋。',
    description: '每用过一次叠刺+1；卡面数字为叠刺层数。',
    scalingDamage,
  };
}

function makeGolem(id: string, opts: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'monster',
    name: 'Golem',
    value: 5,
    hp: 10,
    maxHp: 10,
    attack: 2,
    currentLayer: 1,
    fury: 1,
    hpLayers: 1,
    antiMagicReflect: 2,
    isStunned: false,
    image: '',
    ...opts,
  };
}

describe('暗影之刺 — Golem 反魔 reflect (regression)', () => {
  it('triggers Golem antiMagicReflect on resolve and damages hero', () => {
    const card = makeShadowSpike(3);
    const golem = makeGolem('golem-1');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
      hp: 30,
      maxHp: 30,
      // No shield equipped → reflect routes to hero HP via APPLY_DAMAGE.
      equipmentSlot1: null as any,
      equipmentSlot2: null as any,
    });

    const afterPlay = drainAutoReleasingFloats(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('scaling-damage');

    const result = drainAutoReleasingFloats(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'scaling-damage', monsterId: 'golem-1' } as GameAction],
    );

    // Golem took the spell damage (3 → hp 10-3=7, layer still 1 since hp > 0).
    const finalGolem = result.state.activeCards.find(c => c?.id === 'golem-1') as GameCardData | undefined;
    expect(finalGolem).toBeDefined();
    expect(finalGolem!.hp).toBe(7);

    // Hero took 反魔 reflect damage (2). No shield → APPLY_DAMAGE selfInflicted.
    expect(result.state.hp).toBe(28);

    // combat:heroDamaged side effect emitted from APPLY_DAMAGE (the reflect).
    const allSideEffects = [...afterPlay.sideEffects, ...result.sideEffects];
    const heroDamaged = allSideEffects.find(e => e.event === 'combat:heroDamaged');
    expect(heroDamaged).toBeDefined();
    expect((heroDamaged!.payload as { damage: number }).damage).toBe(2);
  });

  it('emits card:magicFinalized side effect (was skipped before fix)', () => {
    const card = makeShadowSpike(3);
    const golem = makeGolem('golem-2');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
    });

    const afterPlay = drainAutoReleasingFloats(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drainAutoReleasingFloats(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'scaling-damage', monsterId: 'golem-2' } as GameAction],
    );

    const allSideEffects = [...afterPlay.sideEffects, ...result.sideEffects];
    const finalized = allSideEffects.find(e => e.event === 'card:magicFinalized');
    expect(finalized).toBeDefined();
    expect((finalized!.payload as { card: GameCardData }).card.name).toBe('暗影之刺');
    expect((finalized!.payload as { dealtDamage: boolean }).dealtDamage).toBe(true);
  });

  it('increments damageMagicPlayedThisTurn (so 奥术护盾 sees this as a damage magic)', () => {
    const card = makeShadowSpike(3);
    const golem = makeGolem('golem-3');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
      damageMagicPlayedThisTurn: 0,
    });

    const afterPlay = drainAutoReleasingFloats(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drainAutoReleasingFloats(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'scaling-damage', monsterId: 'golem-3' } as GameAction],
    );

    expect(result.state.damageMagicPlayedThisTurn).toBe(1);
  });

  it('lands in recycle bag with scalingDamage incremented to next layer', () => {
    const card = makeShadowSpike(3);
    const golem = makeGolem('golem-4');
    const state = makeState({
      handCards: [card] as any,
      activeCards: [golem, null, null, null, null] as ActiveRowSlots,
    });

    const afterPlay = drainAutoReleasingFloats(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drainAutoReleasingFloats(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'scaling-damage', monsterId: 'golem-4' } as GameAction],
    );

    const inRecycle = result.state.permanentMagicRecycleBag.find(c => c.id === card.id);
    expect(inRecycle).toBeDefined();
    expect(inRecycle!.scalingDamage).toBe(4);
    // ADD_TO_RECYCLE_BAG (the canonical disposition) sets _recycleWaits, unlike
    // the old direct ADD_PERMANENT_MAGIC_TO_RECYCLE shortcut.
    expect((inRecycle as GameCardData & { _recycleWaits?: number })._recycleWaits).toBe(1);
  });

  it('skips reflect when Golem is stunned (existing antiMagicReflect contract)', () => {
    const card = makeShadowSpike(3);
    const stunnedGolem = makeGolem('golem-stunned', { isStunned: true });
    const state = makeState({
      handCards: [card] as any,
      activeCards: [stunnedGolem, null, null, null, null] as ActiveRowSlots,
      hp: 30,
      maxHp: 30,
    });

    const afterPlay = drainAutoReleasingFloats(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drainAutoReleasingFloats(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'scaling-damage', monsterId: 'golem-stunned' } as GameAction],
    );

    // Spell damage still landed; reflect was suppressed by stun.
    const finalGolem = result.state.activeCards.find(c => c?.id === 'golem-stunned') as GameCardData | undefined;
    expect(finalGolem!.hp).toBe(7);
    expect(result.state.hp).toBe(30);
  });
});

describe('暗影之刺 baseline (no Golem) — finalize side effects still emit', () => {
  it('non-Golem target still emits card:magicFinalized + increments damageMagicPlayedThisTurn', () => {
    // Sanity check that the fix applies to all targets, not just monsters with
    // antiMagicReflect.
    const card = makeShadowSpike(3);
    const skeleton: GameCardData = {
      id: 'skel-1',
      type: 'monster',
      name: 'Skeleton',
      value: 3,
      hp: 5,
      maxHp: 5,
      attack: 2,
      currentLayer: 1,
      fury: 1,
      hpLayers: 1,
      isStunned: false,
      image: '',
    };
    const state = makeState({
      handCards: [card] as any,
      activeCards: [skeleton, null, null, null, null] as ActiveRowSlots,
      damageMagicPlayedThisTurn: 0,
    });

    const afterPlay = drainAutoReleasingFloats(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drainAutoReleasingFloats(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'scaling-damage', monsterId: 'skel-1' } as GameAction],
    );

    expect(result.state.damageMagicPlayedThisTurn).toBe(1);
    const finalized = [...afterPlay.sideEffects, ...result.sideEffects]
      .find(e => e.event === 'card:magicFinalized');
    expect(finalized).toBeDefined();
  });
});

// Keep `drain` reachable for symbol-export tooling even if all paths use the
// auto-release helper above.
void drain;
