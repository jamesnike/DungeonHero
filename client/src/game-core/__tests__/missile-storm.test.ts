import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { drainAutoReleasingFloats } from './_helpers';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import { initialCombatState } from '../constants';
import { getEternalRelic } from '@/lib/eternalRelics';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeBoltGraveyardCard(idSuffix: string, amplifyBonus = 0) {
  return {
    id: `gy-bolt-${idSuffix}`,
    type: 'magic' as const,
    name: '魔弹',
    value: 0,
    knightEffect: 'missile-bolt',
    magicType: 'instant',
    amplifyBonus,
  };
}

// 魔弹风暴 数值：
//   L0 (base)：调动坟场一半（向上取整）的「魔弹」
//   L1 (upgraded)：调动坟场全部「魔弹」
// 老测试均在 "fire all bolts" 语义下编写——保留这些测试作为 L1 行为的回归覆盖；
// 新增 describe 块单独覆盖 L0 一半语义。
function makeStormCard(id = 'card-storm', upgradeLevel = 1) {
  return {
    id,
    type: 'magic' as const,
    name: '魔弹风暴',
    value: 0,
    classCard: true,
    magicType: 'instant',
    knightEffect: 'missile-storm',
    upgradeLevel,
    maxUpgradeLevel: 1,
  };
}

function makeMonster(id: string, name = 'Goblin', hp = 10) {
  return {
    id,
    type: 'monster' as const,
    name,
    value: hp,
    hp,
    maxHp: hp,
    attack: 5,
  };
}

describe('魔弹风暴 — knightMissileStorm resolver', () => {
  it('fizzles when active row has no monsters', () => {
    const storm = makeStormCard();
    const state = makeState({
      activeCards: [null, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [makeBoltGraveyardCard('1'), makeBoltGraveyardCard('2')] as any,
      combatState: { ...initialCombatState, currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects.find(s => s.event === 'combat:missileStormBolt');
    expect(boltFx).toBeUndefined();
    const noMonsterLog = drained.sideEffects.find(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('激活行没有怪物'),
    );
    expect(noMonsterLog).toBeDefined();
    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx).toHaveLength(0);
  });

  it('fizzles when graveyard has no 魔弹', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1');
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects.find(s => s.event === 'combat:missileStormBolt');
    expect(boltFx).toBeUndefined();
    const noBoltLog = drained.sideEffects.find(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('坟场中没有'),
    );
    expect(noBoltLog).toBeDefined();
    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx).toHaveLength(0);
  });

  it('fires one bolt per 魔弹 in the graveyard, each emitted as a missileStormBolt event', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const bolts = [
      makeBoltGraveyardCard('a'),
      makeBoltGraveyardCard('b'),
      makeBoltGraveyardCard('c'),
    ];
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects.filter(s => s.event === 'combat:missileStormBolt');
    expect(boltFx).toHaveLength(3);
    boltFx.forEach((fx, i) => {
      const payload = fx.payload as any;
      expect(payload.boltIndex).toBe(i);
      expect(payload.totalBolts).toBe(3);
      expect(payload.targetId).toBe('m1');
      expect(payload.damage).toBeGreaterThanOrEqual(1);
    });

    const damageFx = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageFx.length).toBeGreaterThanOrEqual(3);
  });

  it('does not consume the 魔弹 cards from the graveyard', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const bolts = [makeBoltGraveyardCard('a'), makeBoltGraveyardCard('b')];
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [...bolts, { id: 'other', type: 'magic', name: '其他卡', value: 0 } as any] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const remainingBolts = drained.state.discardedCards.filter(c => c.name === '魔弹');
    expect(remainingBolts).toHaveLength(2);
  });

  it('respects each bolt amplifyBonus when computing damage', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [
        makeBoltGraveyardCard('a', 0),
        makeBoltGraveyardCard('b', 2),
      ] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects
      .filter(s => s.event === 'combat:missileStormBolt')
      .map(s => s.payload as any);
    // First bolt: 1 + 0 = 1; second bolt: 1 + 2 = 3 (assuming no spell-damage modifiers).
    expect(boltFx[0].damage).toBeGreaterThanOrEqual(1);
    expect(boltFx[1].damage).toBeGreaterThan(boltFx[0].damage);
  });

  it('applies missile-draw-1 relic per bolt fired', () => {
    const storm = makeStormCard();
    const monster = makeMonster('m1', 'Goblin', 100);
    const bolts = [makeBoltGraveyardCard('a'), makeBoltGraveyardCard('b')];
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      eternalRelics: [getEternalRelic('missile-draw-1')],
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const drawLogs = drained.sideEffects.filter(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('汲取弹幕'),
    );
    expect(drawLogs.length).toBe(2);
  });

  it('distributes shots across multiple monsters (random per bolt at fire time)', () => {
    const storm = makeStormCard();
    const m1 = makeMonster('m1', 'Goblin A', 100);
    const m2 = makeMonster('m2', 'Goblin B', 100);
    const m3 = makeMonster('m3', 'Goblin C', 100);
    const bolts = Array.from({ length: 12 }, (_, i) => makeBoltGraveyardCard(`b${i}`));
    const state = makeState({
      activeCards: [m1, m2, m3, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1', 'm2', 'm3'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects
      .filter(s => s.event === 'combat:missileStormBolt')
      .map(s => s.payload as any);
    expect(boltFx).toHaveLength(12);
    const uniqueTargets = new Set(boltFx.map(p => p.targetId));
    // With 12 random rolls across 3 targets, near-certainly hit ≥2 distinct monsters.
    expect(uniqueTargets.size).toBeGreaterThanOrEqual(2);
    for (const fx of boltFx) {
      expect(['m1', 'm2', 'm3']).toContain(fx.targetId);
    }
  });

  // 关键回归测试：之前的 bug 是 resolver 阶段一次性预选目标，导致首发击杀后剩余魔弹
  // 都打在已死的同一目标上 → "只造成一次伤害"。修复后每发在 fire-time 重选目标，
  // 即使原目标已死且无复生，剩余魔弹也会落到剩余的活怪物上。
  it('redirects remaining bolts to other live monsters when the first target dies (no revive)', () => {
    const storm = makeStormCard();
    // m1 has only 1 hp so the very first bolt kills it; m2/m3 stay alive.
    const m1 = makeMonster('m1', 'Goblin A', 1);
    const m2 = makeMonster('m2', 'Goblin B', 100);
    const m3 = makeMonster('m3', 'Goblin C', 100);
    const bolts = Array.from({ length: 6 }, (_, i) => makeBoltGraveyardCard(`b${i}`));
    const state = makeState({
      activeCards: [m1, m2, m3, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1', 'm2', 'm3'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects
      .filter(s => s.event === 'combat:missileStormBolt')
      .map(s => s.payload as any);
    expect(boltFx).toHaveLength(6);
    // m1 has only 1 hp and no revive. Once it takes any bolt it dies and is removed
    // from the live-monster pool, so it must be targeted by AT MOST one bolt.
    // The PRE-FIX behavior would target m1 with multiple pre-snapshotted bolts that
    // all silently fizzle inside damageMonsterWithLayerOverflow → "only 1 damage".
    const m1Hits = boltFx.filter(p => p.targetId === 'm1').length;
    expect(m1Hits).toBeLessThanOrEqual(1);
    // All 6 bolts must land on a real live target — none should be wasted on a dead m1.
    const damageEvents = drained.sideEffects.filter(s => s.event === 'combat:monsterDamaged');
    expect(damageEvents.length).toBeGreaterThanOrEqual(6);
  });

  it('fizzles bolts cleanly when only target dies and no other monsters remain', () => {
    const storm = makeStormCard();
    const m1 = makeMonster('m1', 'LoneGoblin', 1);
    const bolts = Array.from({ length: 4 }, (_, i) => makeBoltGraveyardCard(`b${i}`));
    const state = makeState({
      activeCards: [m1, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects.filter(s => s.event === 'combat:missileStormBolt');
    // Only the first bolt has a live target; remaining 3 fizzle (no FX, just a log).
    expect(boltFx).toHaveLength(1);
    const fizzleLogs = drained.sideEffects.filter(
      s => s.event === 'log:entry' && (s.payload as any).message?.includes('魔弹熄灭'),
    );
    expect(fizzleLogs.length).toBe(3);
  });

  it('continues firing remaining bolts onto a revived monster (Skeleton hasRevive)', () => {
    const storm = makeStormCard();
    // Single skeleton: 1 hp + revive. First bolt kills it → revival restores it →
    // remaining bolts must keep landing on the same id.
    const skeleton = {
      ...makeMonster('sk1', 'Skeleton', 1),
      monsterType: 'Skeleton',
      currentLayer: 1,
      hpLayers: 1,
      fury: 1,
      hasRevive: true,
      reviveUsed: false,
      maxHp: 1,
    };
    const bolts = Array.from({ length: 5 }, (_, i) => makeBoltGraveyardCard(`b${i}`));
    const state = makeState({
      activeCards: [skeleton, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['sk1'], currentTurn: 'hero' },
    });

    // Skeleton revival fires a 'death:revive' skill float that hard-pauses the
    // pipeline between bolts. Real game waits for the UI to release; here we
    // auto-release to keep the bolt cascade going.
    const drained = drainAutoReleasingFloats(state, [
      { type: 'PLAY_CARD', cardId: storm.id },
    ] as any);
    const boltFx = drained.sideEffects
      .filter(s => s.event === 'combat:missileStormBolt')
      .map(s => s.payload as any);
    // Bolt 0 kills, revival fires before bolt 1 → bolt 1 hits revived sk1, bolt 2 kills again
    // (no more revives) and bolts 3/4 fizzle. So at least 2 bolts should target 'sk1'.
    const sk1Hits = boltFx.filter(p => p.targetId === 'sk1').length;
    expect(sk1Hits).toBeGreaterThanOrEqual(2);
    const damageEvents = drained.sideEffects.filter(
      s => s.event === 'combat:monsterDamaged' && (s.payload as any).monsterId === 'sk1',
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(2);
  });
});

describe('魔弹风暴 — L0 base: half bolts (ceil)', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
    [10, 5],
  ])('坟场 %i 张「魔弹」→ 发射 %i 枚 (ceil(N/2))', (totalBolts, expected) => {
    const storm = makeStormCard('card-storm-L0', 0);
    const monster = makeMonster('m1', 'Goblin', 1000);
    const bolts = Array.from({ length: totalBolts }, (_, i) => makeBoltGraveyardCard(`b${i}`));
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects.filter(s => s.event === 'combat:missileStormBolt');
    expect(boltFx).toHaveLength(expected);
    boltFx.forEach((fx, i) => {
      const payload = fx.payload as any;
      expect(payload.boltIndex).toBe(i);
      expect(payload.totalBolts).toBe(expected);
    });
  });

  it('L0 banner 提示「调动一半」，L1 banner 不提示', () => {
    const monster = makeMonster('m1', 'Goblin', 1000);
    const bolts = [makeBoltGraveyardCard('a'), makeBoltGraveyardCard('b'), makeBoltGraveyardCard('c'), makeBoltGraveyardCard('d')];

    const stormL0 = makeStormCard('card-L0', 0);
    const stateL0 = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [stormL0] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });
    const drainedL0 = drain(stateL0, [{ type: 'PLAY_CARD', cardId: stormL0.id }] as any);
    const bannerL0 = drainedL0.sideEffects.find(s => s.event === 'ui:banner');
    expect((bannerL0?.payload as any)?.text).toContain('调动一半');

    const stormL1 = makeStormCard('card-L1', 1);
    const stateL1 = makeState({
      activeCards: [{ ...monster }, null, null, null, null] as any,
      handCards: [stormL1] as any,
      discardedCards: bolts as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });
    const drainedL1 = drain(stateL1, [{ type: 'PLAY_CARD', cardId: stormL1.id }] as any);
    const bannerL1 = drainedL1.sideEffects.find(s => s.event === 'ui:banner');
    expect((bannerL1?.payload as any)?.text).not.toContain('调动一半');
  });

  it('L0 选择前 N/2 张坟场顺序，保留各自的 amplifyBonus', () => {
    // 4 张「魔弹」按 amplifyBonus=[0, 5, 0, 0] 顺序入坟场。
    // L0 ceil(4/2) = 2 → 取前 2 张（amp 0, amp 5）；
    // L1 取全部 4 张。验证 L0 的第 2 发伤害高于第 1 发（来自 amp=5 的 bolt）。
    const storm = makeStormCard('card-amp', 0);
    const monster = makeMonster('m1', 'Goblin', 1000);
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [storm] as any,
      discardedCards: [
        makeBoltGraveyardCard('a', 0),
        makeBoltGraveyardCard('b', 5),
        makeBoltGraveyardCard('c', 0),
        makeBoltGraveyardCard('d', 0),
      ] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: storm.id }] as any);
    const boltFx = drained.sideEffects
      .filter(s => s.event === 'combat:missileStormBolt')
      .map(s => s.payload as any);
    expect(boltFx).toHaveLength(2);
    expect(boltFx[0].damage).toBe(1);
    expect(boltFx[1].damage).toBe(6);
  });
});
