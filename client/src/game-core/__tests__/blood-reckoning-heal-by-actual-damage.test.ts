/**
 * 点金裁决 (blood-reckoning) — 卡面文案：
 *   「对任意怪物造成等同于当前金币数量的伤害，并恢复等量生命。」
 *
 * 玩家直觉：「打了多少回多少」。即 heal = **实际造成的伤害**，不是 totalDamage。
 *
 * 这条不变量曾经被违反 —— 旧实现 enqueue HEAL totalDamage，导致：
 *   - 100 金 vs 单层 3 HP 怪 → 实际打 3，但回 100（卖油翁式无中生有）
 *   - 诅咒碑光环下打 Marble Golem → 实际打 0，但仍回 100
 *   - Wraith 50% 法抗下 100 金 → 实际打 50，但回 100
 *   - 自伤 + 不灭守护 → 死守把伤害归 0，但仍回 100
 *
 * 修复：reducer 端镜像「DEAL_DAMAGE_TO_MONSTER 减免链 + 单层 HP cap」决定回血。
 *      自伤路径预览 computeDamage（盾 armor + tempShield + HP）算 actualDamage。
 *
 * 任何对 `reduceDealDamageToMonster` 的减免链 / `computeDamage` 自伤链 的新增分支，
 * 必须在 `computeEffectiveSpellDamageOnMonster` / 自伤 preview helper 同步更新，
 * 否则这些测试会开始撒谎（与 spell-overkill-mitigation 同款 lock-step 约束）。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import { initialCombatState } from '../constants';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput' as GameState['phase'],
    ...overrides,
  };
}

function makeBloodReckoningCard(idSuffix = 'br'): any {
  return {
    id: `magic-blood-reckoning-${idSuffix}`,
    type: 'magic' as const,
    name: '点金裁决',
    value: 0,
    image: '',
    magicType: 'instant' as const,
    magicEffect: '对任意怪物造成等同于当前金币数量的伤害，并恢复等量生命。',
  };
}

function makeMonster(id: string, name: string, hp: number, extras: Record<string, unknown> = {}): any {
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

function makeBuglet(id: string): any {
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

function makeCurseStele(id = 'curse-stele-1'): any {
  return {
    id,
    type: 'building' as const,
    name: '诅咒碑',
    value: 1,
    buildingAura: 'stacked-magic-immune' as const,
  };
}

function makeShield(id = 'wood-shield-1', armor = 5, durability = 2): EquipmentItem {
  return {
    id,
    type: 'shield',
    name: 'Wooden Shield',
    value: armor,
    image: '',
    armorMax: armor,
    durability,
    maxDurability: durability,
    fromSlot: 'equipmentSlot1',
  } as unknown as EquipmentItem;
}

function makeDeathWardCard(idSuffix = 'dw'): any {
  return {
    id: `magic-death-ward-${idSuffix}`,
    type: 'magic' as const,
    name: '不灭守护',
    value: 0,
    image: '',
    magicType: 'instant' as const,
    magicEffect: 'death-ward',
  };
}

function activeRow(...cards: any[]): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

function findMonster(state: GameState, id: string): { hp?: number } | undefined {
  return state.activeCards.find(c => c?.id === id) as { hp?: number } | undefined;
}

function playAndTarget(
  state: GameState,
  cardId: string,
  monsterId: string,
): { state: GameState; sideEffects: any[] } {
  const after1 = drain(state, [{ type: 'PLAY_CARD', cardId } as GameAction]);
  const after2 = drain(after1.state, [
    { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'blood-reckoning', monsterId } as GameAction,
  ]);
  return { state: after2.state, sideEffects: [...after1.sideEffects, ...after2.sideEffects] };
}

function playAndTargetHero(
  state: GameState,
  cardId: string,
): { state: GameState; sideEffects: any[] } {
  const after1 = drain(state, [{ type: 'PLAY_CARD', cardId } as GameAction]);
  const after2 = drain(after1.state, [
    {
      type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
      magicId: 'blood-reckoning',
      monsterId: '',
      targetType: 'hero',
    } as GameAction,
  ]);
  return { state: after2.state, sideEffects: [...after1.sideEffects, ...after2.sideEffects] };
}

function playAndTargetShieldSlot(
  state: GameState,
  cardId: string,
  slotId: 'equipmentSlot1' | 'equipmentSlot2',
): { state: GameState; sideEffects: any[] } {
  const after1 = drain(state, [{ type: 'PLAY_CARD', cardId } as GameAction]);
  const after2 = drain(after1.state, [
    {
      type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
      magicId: 'blood-reckoning',
      monsterId: '',
      targetType: 'shield-slot',
      slotId,
    } as GameAction,
  ]);
  return { state: after2.state, sideEffects: [...after1.sideEffects, ...after2.sideEffects] };
}

// ---------------------------------------------------------------------------
// 怪物目标：减免链 + 单层 HP cap
// ---------------------------------------------------------------------------

describe('点金裁决 — heal = actual damage dealt to monster', () => {
  it('baseline: 7 金 vs 50 HP 怪物 → 全打 7, 回 7 血', () => {
    const card = makeBloodReckoningCard('baseline');
    const monster = makeMonster('m-baseline', 'Big Monster', 50);
    const state = makeState({
      hp: 10,
      gold: 7,
      handCards: [card] as any,
      activeCards: activeRow(monster),
    });
    const result = playAndTarget(state, card.id, monster.id);
    expect(findMonster(result.state, 'm-baseline')?.hp).toBe(43);
    expect(result.state.hp).toBe(17); // 10 + 7 heal
  });

  it('单层 overkill: 100 金 vs 单层 3 HP 怪物 → 实际打 3, 回 3 血（不回 100）', () => {
    const card = makeBloodReckoningCard('overkill');
    const monster = makeMonster('m-overkill', 'Tiny Monster', 3);
    const state = makeState({
      hp: 5,
      permanentMaxHpBonus: 100,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(monster),
    });
    const result = playAndTarget(state, card.id, monster.id);
    // 怪物 hp 归零（活在 activeCards 里待 MONSTER_DEFEATED 后续处理；只检查 hp）
    const after = findMonster(result.state, 'm-overkill');
    expect(after?.hp).toBe(0);
    // 回血 = 3, 不是 100
    expect(result.state.hp).toBe(8);
  });

  it('诅咒碑光环 (免疫魔法): 100 金 → 实际打 0, 回 0 血, 怪物毫发无损', () => {
    const card = makeBloodReckoningCard('immune');
    const golem = makeMonster('m-golem', 'Marble Golem', 10);
    const state = makeState({
      hp: 5,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(golem),
      activeCardStacks: { 0: [makeCurseStele()] as any },
    });
    const result = playAndTarget(state, card.id, golem.id);
    expect(findMonster(result.state, 'm-golem')?.hp).toBe(10);
    expect(result.state.hp).toBe(5); // 不回血
  });

  it('虫盾 (含场上有虫): 100 金 → 实际打 0, 回 0 血', () => {
    const card = makeBloodReckoningCard('buglet');
    const swarmer = makeMonster('m-swarm', 'Swarm Lord', 10, { swarmBugletShield: true });
    const buglet = makeBuglet('m-buglet');
    const state = makeState({
      hp: 5,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(swarmer, buglet),
    });
    const result = playAndTarget(state, card.id, swarmer.id);
    expect(findMonster(result.state, 'm-swarm')?.hp).toBe(10);
    expect(result.state.hp).toBe(5);
  });

  it('法抗 50% (Wraith): 100 金 → 实际打 50 (≤ 100 HP), 回 50 血', () => {
    const card = makeBloodReckoningCard('resist');
    const wraith = makeMonster('m-wraith', 'Wraith', 100, { spellDamageReduction: 0.5 });
    const state = makeState({
      hp: 5,
      permanentMaxHpBonus: 100,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(wraith),
    });
    const result = playAndTarget(state, card.id, wraith.id);
    expect(findMonster(result.state, 'm-wraith')?.hp).toBe(50);
    expect(result.state.hp).toBe(55); // 5 + 50
  });

  it('法抗 + 单层 cap: 100 金 vs Wraith 30HP/50%抗 → 减免到 50, clamp 30, 回 30 血', () => {
    const card = makeBloodReckoningCard('resist-cap');
    const wraith = makeMonster('m-wraith2', 'Frail Wraith', 30, { spellDamageReduction: 0.5 });
    const state = makeState({
      hp: 5,
      permanentMaxHpBonus: 100,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(wraith),
    });
    const result = playAndTarget(state, card.id, wraith.id);
    // 50 effective vs 30 HP → 怪物 hp 归零（overflow 浪费）
    const after = findMonster(result.state, 'm-wraith2');
    expect(after?.hp).toBe(0);
    expect(result.state.hp).toBe(35); // 5 + 30, 不是 5 + 50
  });

  it('Golem maxDamagePerHit cap: 100 金 vs Golem 7HP/cap5 → 实际打 5, 回 5 血', () => {
    const card = makeBloodReckoningCard('cap');
    const golem = makeMonster('m-elite-golem', 'Elite Golem', 7, { maxDamagePerHit: 5 });
    const state = makeState({
      hp: 5,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(golem),
    });
    const result = playAndTarget(state, card.id, golem.id);
    expect(findMonster(result.state, 'm-elite-golem')?.hp).toBe(2);
    expect(result.state.hp).toBe(10); // 5 + 5
  });

  it('多血层 overflow 不串层: 100 金 vs 第 2 层 5HP / 共 3 层 → 实际打 5 (掉 1 层), 回 5 血', () => {
    const card = makeBloodReckoningCard('multi-layer');
    const dragon = makeMonster('m-dragon', 'Dragon', 5, {
      maxHp: 5,
      currentLayer: 3,
      hpLayers: 3,
      fury: 3,
    });
    const state = makeState({
      hp: 5,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(dragon),
    });
    const result = playAndTarget(state, card.id, dragon.id);
    // 掉 1 层（第 2 层），下一层满血 5
    const after = findMonster(result.state, 'm-dragon') as any;
    expect(after).toBeDefined();
    expect(after.currentLayer).toBe(2);
    expect(after.hp).toBe(5);
    // 回 5, 不是 100
    expect(result.state.hp).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 自伤目标：实际命中 = 盾 armor + tempShield + HP loss
// ---------------------------------------------------------------------------

describe('点金裁决 — heal = actual damage dealt to hero side (self-target)', () => {
  it('选英雄 (无盾无 tempShield): 30 金 vs 50 HP → HP -30, HEAL 30 → 净 HP 不变', () => {
    const card = makeBloodReckoningCard('self-1');
    const state = makeState({
      hp: 50,
      permanentMaxHpBonus: 30,
      gold: 30,
      handCards: [card] as any,
      activeCards: activeRow(),
    });
    const result = playAndTargetHero(state, card.id);
    // APPLY_DAMAGE 30 → HP 20; HEAL 30 → HP 50
    expect(result.state.hp).toBe(50);
  });

  it('选英雄 + 不灭守护 in hand: 100 金 vs 30 HP → 死守归零 → 回 0 血 (不是 100)', () => {
    const card = makeBloodReckoningCard('self-dw');
    const dw = makeDeathWardCard('dw1');
    const state = makeState({
      hp: 30,
      gold: 100,
      handCards: [card, dw] as any,
      activeCards: activeRow(),
    });
    const result = playAndTargetHero(state, card.id);
    // 死守消耗：HP 不变 30, 不灭守护进坟场
    expect(result.state.hp).toBe(30);
    expect(result.state.discardedCards.some(c => c.id === dw.id)).toBe(true);
  });

  it('选英雄 + tempShield: tempShield 50, 30 金 → tempShield 吃 30, 回 30 血', () => {
    const card = makeBloodReckoningCard('self-temp');
    const state = makeState({
      hp: 10,
      permanentMaxHpBonus: 30, // maxHp 50
      tempShield: 50,
      gold: 30,
      handCards: [card] as any,
      activeCards: activeRow(),
    });
    const result = playAndTargetHero(state, card.id);
    // tempShield 50 吃 30 → tempShield 20, HP 不变
    expect(result.state.tempShield).toBe(20);
    expect(result.state.hp).toBe(40); // 10 + 30 heal
  });

  it('选英雄 HP 不够: HP 10 (max 50), 100 金 → 实际伤害 = HP loss 10, HEAL 10 → hp 10, 已 gameOver', () => {
    const card = makeBloodReckoningCard('self-die');
    const state = makeState({
      hp: 10,
      permanentMaxHpBonus: 30,
      gold: 100,
      handCards: [card] as any,
      activeCards: activeRow(),
    });
    const result = playAndTargetHero(state, card.id);
    // APPLY_DAMAGE 100 → hp 0 + gameOver；HEAL 10 (actualDamage = HP loss 10) → hp 10
    // 净结果：gameOver=true 但 hp=10（HEAL 没法救场，只能弥补一部分）
    expect(result.state.gameOver).toBe(true);
    expect(result.state.hp).toBe(10);
  });

  it('选盾栏: 5 armor 盾 / totalDamage 3 → 盾吃 3, 回 3 血', () => {
    const card = makeBloodReckoningCard('shield-low');
    const shield = makeShield('shield-1', 5, 2);
    const state = makeState({
      hp: 10,
      permanentMaxHpBonus: 30, // maxHp 50, 留出 heal 空间
      gold: 3,
      handCards: [card] as any,
      equipmentSlot1: shield,
      activeCards: activeRow(),
    });
    const result = playAndTargetShieldSlot(state, card.id, 'equipmentSlot1');
    expect(result.state.hp).toBe(13); // 10 + 3
  });

  it('选盾栏溢出: 5 armor 盾 / totalDamage 8 → 盾吃 5 + HP 吃 3, 回 8 血', () => {
    const card = makeBloodReckoningCard('shield-overflow');
    const shield = makeShield('shield-2', 5, 2);
    const state = makeState({
      hp: 20,
      permanentMaxHpBonus: 30,
      gold: 8,
      handCards: [card] as any,
      equipmentSlot1: shield,
      activeCards: activeRow(),
    });
    const result = playAndTargetShieldSlot(state, card.id, 'equipmentSlot1');
    // overflow 3 走 APPLY_DAMAGE → HP 20-3=17; HEAL 8 → HP 25
    expect(result.state.hp).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// 回响 (echo×2): 数值翻倍后仍按 actual damage 回血
// ---------------------------------------------------------------------------

describe('点金裁决 — heal under echo×2 still uses actual damage', () => {
  it('回响×2 + 100 HP 怪 + 50 金 → totalDamage 100, 实际打 100, 回 100 血', () => {
    const card = makeBloodReckoningCard('echo-full');
    const monster = makeMonster('m-echo-1', 'Big', 100);
    const state = makeState({
      hp: 5,
      permanentMaxHpBonus: 200, // maxHp 220
      gold: 50,
      handCards: [card] as any,
      activeCards: activeRow(monster),
      doubleNextMagic: true,
    });
    const result = playAndTarget(state, card.id, monster.id);
    expect(findMonster(result.state, 'm-echo-1')?.hp).toBe(0);
    // 回响 ×2 = totalDamage 100 一次性结算；怪物 HP 100 完全吃下 → actualDamage 100
    expect(result.state.hp).toBe(105); // 5 + 100
  });

  it('回响×2 + 单层 5HP 怪 + 50 金 → totalDamage 100, 实际打 5, 回 5 血 (不回 100)', () => {
    const card = makeBloodReckoningCard('echo-overkill');
    const monster = makeMonster('m-echo-2', 'Tiny', 5);
    const state = makeState({
      hp: 10,
      permanentMaxHpBonus: 100,
      gold: 50,
      handCards: [card] as any,
      activeCards: activeRow(monster),
      doubleNextMagic: true,
    });
    const result = playAndTarget(state, card.id, monster.id);
    expect(findMonster(result.state, 'm-echo-2')?.hp).toBe(0);
    expect(result.state.hp).toBe(15); // 10 + 5
  });
});
