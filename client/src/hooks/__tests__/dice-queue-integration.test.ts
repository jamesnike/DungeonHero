/**
 * Integration test: simulate the real engine + listener + dice queue wiring
 * for 雷涌一击 (knight:stun-cap-strike). Verifies the queue actually shows
 * the stun dice modal after the player picks a target — i.e. catches any
 * regression where ui:requestDice fires but the queue's `show` callback
 * never runs (which would explain the user-reported "no modal" bug).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine, type GameAction } from '../../game-core';
import { createDiceQueue } from '../dice-queue';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../../game-core/card-schema';

function makeStunCapStrike(idSuffix = 'one') {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '雷涌一击',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    description: 'test',
    knightEffect: 'stun-cap-strike',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
  };
}

function makeMonster(id: string, hp = 50) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
  };
}

function activeRowOf(...monsters: Array<ReturnType<typeof makeMonster>>): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

/**
 * Mirrors the show-callback wiring in useEventSystem.ts (createDiceQueue init):
 * if engine is currently in 'awaitingSkillFloat' phase, defer the SET_EVENT_
 * DICE_MODAL dispatch until the float queue drains. Otherwise dispatch
 * synchronously. The two listed bugs the wiring fixes:
 *
 *   1. ui:requestDice → re-entrant SET_EVENT_DICE_MODAL would land in
 *      _dispatchQueue and get dropped by the awaitingSkillFloat guard in
 *      GameEngine._processAction (when DEAL_DAMAGE_TO_MONSTER triggered a
 *      monster passive's TRIGGER_MONSTER_SKILL_FLOAT during the same drain).
 *   2. Multiple dice in flight while floats are blocking — each defers
 *      independently.
 */
function makeDiceQueueWithSkillFloatGuard(engine: GameEngine, shownConfigs: any[]) {
  return createDiceQueue<any, any>(entry => {
    shownConfigs.push({ title: entry.config.title, subtitle: entry.config.subtitle });
    const open = () => {
      engine.dispatch({
        type: 'SET_EVENT_DICE_MODAL',
        payload: {
          title: entry.config.title,
          subtitle: entry.config.subtitle,
          entries: entry.config.entries,
          rolledValue: null,
          highlightedId: null,
          flowContext: entry.config.flowContext,
          predeterminedRoll: entry.config.predeterminedRoll ?? null,
        },
      } as any);
    };
    if (engine.getState().phase === 'awaitingSkillFloat') {
      const unsub = engine.subscribe(() => {
        if (engine.getState().phase !== 'awaitingSkillFloat') {
          unsub();
          open();
        }
      });
      return;
    }
    open();
  });
}

describe('雷涌一击 dice queue integration (engine + listener + queue)', () => {
  let engine: GameEngine;
  let shownConfigs: Array<{ title: string; subtitle?: string }>;
  let queue: ReturnType<typeof createDiceQueue<any, any>>;

  beforeEach(() => {
    const card = makeStunCapStrike();
    engine = new GameEngine({
      handCards: [card] as any,
      stunCap: 40,
      backpackItems: [{ id: 'b1', type: 'magic' as const, name: 'F', value: 0, image: '' }] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });

    shownConfigs = [];
    queue = makeDiceQueueWithSkillFloatGuard(engine, shownConfigs);

    // Bridge the engine event to the queue, exactly like useCardPlayHandlers.ts:559.
    engine.on('ui:requestDice', payload => {
      const { title, subtitle, entries, context: flowContext, predeterminedRoll } = payload as any;
      void queue.enqueue({ title, subtitle, entries, flowContext, predeterminedRoll });
    });
  });

  it('PLAY_CARD + RESOLVE_MAGIC_MONSTER_SELECTION → dice modal SHOULD pop up', () => {
    engine.dispatch({ type: 'PLAY_CARD', cardId: 'magic-one' } as GameAction);
    expect(engine.getState().pendingMagicAction).toBeTruthy();
    expect((engine.getState().pendingMagicAction as any)?.effect).toBe('stun-cap-strike');

    engine.dispatch({
      type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
      magicId: 'stun-cap-strike',
      monsterId: 'm1',
    } as GameAction);

    // The queue should have shown exactly one dice (the stun check).
    expect(shownConfigs).toHaveLength(1);
    expect(shownConfigs[0].title).toBe('Mm1');
    expect(shownConfigs[0].subtitle).toContain('击晕判定');

    // The engine state should reflect the dice modal being open.
    expect(engine.getState().eventDiceModal).toBeTruthy();
    expect(engine.getState().eventDiceModal?.subtitle).toContain('击晕判定');
  });
});

// ---------------------------------------------------------------------------
// Regression: dice modal must NOT be dropped when a monster-skill float fires
// in the same RESOLVE_MAGIC_MONSTER_SELECTION drain. This is the user-reported
// bug for 雷涌一击 — boss retaliation / dragon breath / bleed / etc. on the
// damaged monster pushes phase to 'awaitingSkillFloat' before the re-entrant
// SET_EVENT_DICE_MODAL gets processed; the engine guard at index.ts then
// drops the dispatch and the player never sees the stun dice.
// ---------------------------------------------------------------------------

describe('dice modal vs awaitingSkillFloat HARD_PAUSE (regression)', () => {
  it('SET_EVENT_DICE_MODAL is deferred while phase=awaitingSkillFloat, then fires after RELEASE', () => {
    const card = makeStunCapStrike();
    const engine = new GameEngine({
      handCards: [card] as any,
      stunCap: 40,
      backpackItems: [{ id: 'b1', type: 'magic' as const, name: 'F', value: 0, image: '' }] as any,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const shownConfigs: any[] = [];
    const queue = makeDiceQueueWithSkillFloatGuard(engine, shownConfigs);

    // Pre-set the engine into awaitingSkillFloat by triggering a float. This
    // simulates the situation right after DEAL_DAMAGE_TO_MONSTER's pipeline
    // step has run a TRIGGER_MONSTER_SKILL_FLOAT.
    engine.dispatch({
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'reflect:bossRetaliation',
    } as GameAction);
    expect(engine.getState().phase).toBe('awaitingSkillFloat');

    // Now request a dice — show callback runs but defers the dispatches.
    void queue.enqueue({
      title: 'Mm1',
      subtitle: '雷涌一击 击晕判定（40%）',
      entries: [
        { id: 'stun', range: [1, 8], label: '击晕成功！', effect: 'none' },
        { id: 'miss', range: [9, 20], label: '未击晕', effect: 'none' },
      ],
      flowContext: { flowId: 'hero-stun', monsterId: 'm1' },
      predeterminedRoll: 5,
    });

    // BEFORE RELEASE: show was called (config recorded), but eventDiceModal
    // is still null because the SET dispatch is waiting for phase to clear.
    expect(shownConfigs).toHaveLength(1);
    expect(engine.getState().eventDiceModal).toBeNull();

    // Drain the float queue.
    const floatId = engine.getState().pendingSkillFloats[0]!.id;
    engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId } as GameAction);

    // AFTER RELEASE: phase is restored, deferred dispatch fires, modal opens.
    expect(engine.getState().phase).not.toBe('awaitingSkillFloat');
    expect(engine.getState().eventDiceModal).toBeTruthy();
    expect(engine.getState().eventDiceModal?.subtitle).toContain('击晕判定');
  });

  it('end-to-end: stun-cap-strike vs monster with bossRetaliation — dice still appears after float drains', () => {
    const card = makeStunCapStrike();
    // Monster with bossRetaliationDamage so DEAL_DAMAGE_TO_MONSTER enqueues
    // a TRIGGER_MONSTER_SKILL_FLOAT in the same drain as RESOLVE_MAGIC_
    // MONSTER_SELECTION's enqueued actions.
    const monster = { ...makeMonster('m1', 50), bossRetaliationDamage: 2 };
    const engine = new GameEngine({
      handCards: [card] as any,
      stunCap: 40,
      backpackItems: [{ id: 'b1', type: 'magic' as const, name: 'F', value: 0, image: '' }] as any,
      activeCards: activeRowOf(monster),
      hp: 30,
    });
    const shownConfigs: any[] = [];
    const queue = makeDiceQueueWithSkillFloatGuard(engine, shownConfigs);
    engine.on('ui:requestDice', payload => {
      const { title, subtitle, entries, context: flowContext, predeterminedRoll } = payload as any;
      void queue.enqueue({ title, subtitle, entries, flowContext, predeterminedRoll });
    });

    engine.dispatch({ type: 'PLAY_CARD', cardId: 'magic-one' } as GameAction);
    engine.dispatch({
      type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
      magicId: 'stun-cap-strike',
      monsterId: 'm1',
    } as GameAction);

    // The boss-retaliation float should have parked the pipeline. dice modal
    // is queued by show() but waiting for phase to clear.
    expect(engine.getState().phase).toBe('awaitingSkillFloat');
    expect(shownConfigs).toHaveLength(1);
    expect(engine.getState().eventDiceModal).toBeNull();

    // Player watches the float, UI dispatches RELEASE.
    const floatId = engine.getState().pendingSkillFloats[0]!.id;
    engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId } as GameAction);

    // Now the dice modal must be open.
    expect(engine.getState().eventDiceModal).toBeTruthy();
    expect(engine.getState().eventDiceModal?.subtitle).toContain('击晕判定');
  });
});
