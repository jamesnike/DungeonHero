import { describe, expect, it } from 'vitest';
import { damageMonsterWithLayerOverflow } from '../combat';
import type { GameCardData } from '@/components/GameCard';

// 命运之刃 (fate-dice-strike) semantics: "右侧为怪物则激怒，直接打掉 2 层血"
//
// Regression: when the right-adjacent card was an elite Golem
// (maxDamagePerHit = 5, layer HP 6-7), the hook called
// damageMonsterWithLayerOverflow(monster, monster.hp) twice expecting each
// call to strip exactly one layer. But maxDamagePerHit capped each call to 5
// damage, so against a single layer with hp=7 the first call only chipped
// hp 7→2 (no layer stripped) and the second call finished it (1 layer
// stripped). Net: only 1 layer removed instead of 2.
//
// Fix: damageMonsterWithLayerOverflow accepts opts.bypassMaxPerHit, and the
// fate-dice-strike path passes it. Other damage sources (weapons, spells)
// keep the cap so Golem's 岩石护体 identity is preserved.

function makeGolem(overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'golem-1',
    type: 'monster',
    name: 'Stone Golem',
    value: 7,
    hp: 7,
    maxHp: 7,
    currentLayer: 2,
    hpLayers: 2,
    fury: 2,
    attack: 4,
    maxDamagePerHit: 5,
    ...overrides,
  } as GameCardData;
}

describe('damageMonsterWithLayerOverflow — maxDamagePerHit bypass', () => {
  it('without bypass: huge damage is capped to maxDamagePerHit (Golem only loses partial HP, no layer)', () => {
    const golem = makeGolem({ hp: 7, maxHp: 7, currentLayer: 2 });
    const after = damageMonsterWithLayerOverflow(golem, 999);
    expect(after.currentLayer).toBe(2); // layer NOT stripped
    expect(after.hp).toBe(2); // hp 7 -> 7 - 5 = 2 (capped)
  });

  it('with bypass: huge damage strips a layer regardless of maxDamagePerHit', () => {
    const golem = makeGolem({ hp: 7, maxHp: 7, currentLayer: 2 });
    const after = damageMonsterWithLayerOverflow(
      golem,
      golem.hp ?? 0,
      undefined,
      { bypassMaxPerHit: true },
    );
    expect(after.currentLayer).toBe(1);
    expect(after.hp).toBe(7); // refilled to maxHp on layer strip
  });

  it('命运之刃 path (bypass) strips 2 layers from a fresh Golem in two calls', () => {
    let golem: GameCardData = makeGolem({
      hp: 7, maxHp: 7, currentLayer: 2, hpLayers: 2, fury: 2,
    });

    // Mirror useEventSystem.ts:1422-1430 with the new bypass option.
    golem = damageMonsterWithLayerOverflow(golem, golem.hp ?? 0, undefined, { bypassMaxPerHit: true });
    expect(golem.currentLayer).toBe(1);

    if ((golem.currentLayer ?? 0) > 0) {
      golem = damageMonsterWithLayerOverflow(golem, golem.hp ?? 0, undefined, { bypassMaxPerHit: true });
    }

    expect(golem.currentLayer).toBe(0);
    expect(golem.hp).toBe(0);
  });

  it('without bypass on the same Golem only strips 1 layer in two calls (the bug)', () => {
    let golem: GameCardData = makeGolem({
      hp: 7, maxHp: 7, currentLayer: 2, hpLayers: 2, fury: 2,
    });

    // Old fate-dice-strike behavior — kept here to document the regression.
    golem = damageMonsterWithLayerOverflow(golem, golem.hp ?? 0);
    // First call: cap=5, hp 7-5=2, no layer strip.
    expect(golem.currentLayer).toBe(2);
    expect(golem.hp).toBe(2);

    if ((golem.currentLayer ?? 0) > 0) {
      golem = damageMonsterWithLayerOverflow(golem, golem.hp ?? 0);
    }
    // Second call: damage=2, cap not engaged (2<5), strips the first layer.
    expect(golem.currentLayer).toBe(1);
    // Net: only 1 layer stripped instead of 2 — the bug.
  });

  it('weapon-style damage (no bypass) on Golem still respects the cap', () => {
    const golem = makeGolem({ hp: 7, maxHp: 7, currentLayer: 2 });
    const after = damageMonsterWithLayerOverflow(golem, 20);
    expect(after.hp).toBe(2);
    expect(after.currentLayer).toBe(2);
  });

  it('non-Golem monster (no maxDamagePerHit) is unaffected by the bypass option', () => {
    const ogre = {
      id: 'ogre-1', type: 'monster' as const, name: 'Ogre', value: 6,
      hp: 6, maxHp: 6, currentLayer: 2, hpLayers: 2, fury: 2, attack: 5,
    } as GameCardData;
    const withBypass = damageMonsterWithLayerOverflow(ogre, 6, undefined, { bypassMaxPerHit: true });
    const withoutBypass = damageMonsterWithLayerOverflow(ogre, 6);
    expect(withBypass.currentLayer).toBe(1);
    expect(withoutBypass.currentLayer).toBe(1);
  });
});
