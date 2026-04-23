/**
 * Monster-skill float queue — reducer-level coverage.
 *
 * Pins the skill-float queue/phase contract that the UI animation relies on:
 *
 *   - Every `MonsterSkillKey` resolves to a non-empty Chinese name and a
 *     valid kind (compile-time check via `getMonsterSkillEntry`'s exhaustive
 *     switch + this runtime sweep guarding against accidental `.name = ''`).
 *   - `TRIGGER_MONSTER_SKILL_FLOAT` enqueues, snapshots phase, and emits the
 *     `ui:monsterSkillFloat` event with the right payload.
 *   - Multiple TRIGGERs in a row stack into a queue (no de-dup) — sequential
 *     animation depends on this.
 *   - `RELEASE_MONSTER_SKILL_FLOAT` pops by id; the LAST release restores the
 *     saved phase; releases of unknown ids are no-ops.
 *
 * These are the invariants that the pipeline `HARD_PAUSE_PHASES` check + the
 * UI hook (`useMonsterSkillFloats`) silently depend on. If any of them break,
 * the animation will either run forever (no release-of-unknown-id no-op) or
 * fail to block the pipeline (phase not switched on first enqueue).
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState, GamePhase } from '../types';
import {
  getMonsterSkillEntry,
  type MonsterSkillKey,
} from '../monsterSkillNames';

const ALL_KEYS: MonsterSkillKey[] = [
  'enter:auto-engage',
  'enter:ogreEnterDiscard',
  'death:lastWords:discardHand',
  'death:lastWords:wraithHaunt',
  'death:lastWords:skeleton',
  'death:lastWords:generic',
  'death:revive',
  'bleed:gainAttack',
  'attack:goblinSteal',
  'attack:goblinStealCard',
  'attack:swarmCorrode',
  'attack:ogreStun',
  'attack:eliteDoubleAttack',
  'reflect:antiMagic',
  'reflect:dragonBleedDestroy',
  'reflect:dragonBreath',
  'reflect:bossRetaliation',
  'turnEnd:wraithAura',
  'turnEnd:wraithTurnEnrage',
  'turnEnd:wraithSelfAttack',
  'turnEnd:wraithDestroyAmulet',
  'turnEnd:goblinStackHeal',
  'turnEnd:goblinStealEquip',
  'turnEnd:golemSpellGrowth',
  'turnEnd:bossLastStandAura',
  'heroTurnEnd:eliteRegen',
  'heroTurnEnd:eliteHealOther',
  'passive:swarmSpawn',
  'passive:swarmHordeRage',
  'passive:lowGoldEliteBuff',
  'waterfall:wraithEnrage',
];

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('monsterSkillNames registry', () => {
  it.each(ALL_KEYS)('%s has a non-empty name and valid kind', (key) => {
    const entry = getMonsterSkillEntry(key);
    expect(entry.name.trim().length).toBeGreaterThan(0);
    expect(entry.kind).toMatch(
      /^(enter|death|bleed|attack|reflect|passive|turnEnd|heroTurnEnd|waterfall|spawn)$/,
    );
  });
});

describe('TRIGGER_MONSTER_SKILL_FLOAT', () => {
  it('enqueues a float, switches phase to awaitingSkillFloat, and snapshots prior phase', () => {
    const startPhase: GamePhase = 'playerInput';
    const state = makeState({ phase: startPhase });
    const result = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'reflect:bossRetaliation',
    });

    expect(result.state.pendingSkillFloats.length).toBe(1);
    expect(result.state.pendingSkillFloats[0].monsterId).toBe('m1');
    expect(result.state.pendingSkillFloats[0].skillKey).toBe(
      'reflect:bossRetaliation',
    );
    expect(result.state.pendingSkillFloats[0].skillName).toBe('反击·反噬');
    expect(result.state.phase).toBe('awaitingSkillFloat');
    expect(result.state.skillFloatSavedPhase).toBe(startPhase);

    expect(result.sideEffects).toContainEqual(
      expect.objectContaining({
        event: 'ui:monsterSkillFloat',
        payload: expect.objectContaining({
          monsterId: 'm1',
          skillKey: 'reflect:bossRetaliation',
          skillName: '反击·反噬',
          kind: 'reflect',
        }),
      }),
    );
  });

  it('does NOT overwrite skillFloatSavedPhase on subsequent TRIGGERs while still in awaitingSkillFloat', () => {
    const startPhase: GamePhase = 'awaitingTarget';
    let state = makeState({ phase: startPhase });
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'death:lastWords:discardHand',
    }).state;
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'death:lastWords:wraithHaunt',
    }).state;
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm2',
      skillKey: 'turnEnd:wraithDestroyAmulet',
    }).state;

    expect(state.pendingSkillFloats.length).toBe(3);
    expect(state.skillFloatSavedPhase).toBe(startPhase);
    expect(state.phase).toBe('awaitingSkillFloat');
  });

  it('multiple TRIGGERs preserve insertion order (FIFO)', () => {
    let state = makeState();
    const keys: MonsterSkillKey[] = [
      'attack:swarmCorrode',
      'attack:goblinSteal',
      'death:revive',
    ];
    for (const skillKey of keys) {
      state = reduce(state, {
        type: 'TRIGGER_MONSTER_SKILL_FLOAT',
        monsterId: 'm-x',
        skillKey,
      }).state;
    }
    expect(state.pendingSkillFloats.map((f) => f.skillKey)).toEqual(keys);
  });
});

describe('RELEASE_MONSTER_SKILL_FLOAT', () => {
  it('pops a single matching float and keeps phase locked while queue non-empty', () => {
    let state = makeState({ phase: 'playerInput' });
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'reflect:dragonBreath',
    }).state;
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm2',
      skillKey: 'reflect:bossRetaliation',
    }).state;

    const firstId = state.pendingSkillFloats[0].id;
    state = reduce(state, {
      type: 'RELEASE_MONSTER_SKILL_FLOAT',
      floatId: firstId,
    }).state;

    expect(state.pendingSkillFloats.length).toBe(1);
    expect(state.pendingSkillFloats[0].skillKey).toBe('reflect:bossRetaliation');
    expect(state.phase).toBe('awaitingSkillFloat');
    expect(state.skillFloatSavedPhase).toBe('playerInput');
  });

  it('the LAST release restores the saved phase and clears the snapshot', () => {
    let state = makeState({ phase: 'playerInput' });
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'enter:auto-engage',
    }).state;
    const onlyId = state.pendingSkillFloats[0].id;

    state = reduce(state, {
      type: 'RELEASE_MONSTER_SKILL_FLOAT',
      floatId: onlyId,
    }).state;

    expect(state.pendingSkillFloats.length).toBe(0);
    expect(state.phase).toBe('playerInput');
    expect(state.skillFloatSavedPhase).toBeNull();
  });

  it('release with unknown floatId is a no-op (does not erroneously clear phase)', () => {
    let state = makeState({ phase: 'playerInput' });
    state = reduce(state, {
      type: 'TRIGGER_MONSTER_SKILL_FLOAT',
      monsterId: 'm1',
      skillKey: 'turnEnd:wraithAura',
    }).state;

    const before = state;
    state = reduce(state, {
      type: 'RELEASE_MONSTER_SKILL_FLOAT',
      floatId: 'definitely-not-a-real-id',
    }).state;

    expect(state.pendingSkillFloats.length).toBe(1);
    expect(state.pendingSkillFloats).toEqual(before.pendingSkillFloats);
    expect(state.phase).toBe('awaitingSkillFloat');
    expect(state.skillFloatSavedPhase).toBe('playerInput');
  });

  it('release with empty queue is a safe no-op (defensive against late hook timer)', () => {
    const state = makeState({ phase: 'playerInput' });
    const result = reduce(state, {
      type: 'RELEASE_MONSTER_SKILL_FLOAT',
      floatId: 'any-id',
    });
    expect(result.state.pendingSkillFloats.length).toBe(0);
    expect(result.state.phase).toBe('playerInput');
  });
});
