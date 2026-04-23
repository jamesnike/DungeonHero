/**
 * Regression: 最终之敌在晕眩状态下被击杀，仍然翻转成 Boss。
 *
 * 设计契约：
 *   monster 牌的"翻转"效果（isFinalMonster && !bossPhase → 变身 Boss）
 *   **不**被晕眩取消。晕眩仅压制 lastWords / revive / boss retaliation 等独立分支。
 *
 * 历史 bug：
 *   reduceMonsterDefeated 的 Branch A 守卫为
 *     if (monster.isFinalMonster && !monster.bossPhase && !monster.isStunned)
 *   导致玩家在晕眩状态下击杀最终之敌时跳过变身、直接走击败分支 → 关卡白通。
 *   修复：去掉 `&& !monster.isStunned`，让 Boss 翻转无条件触发。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeFinalMonster(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'final-1',
    type: 'monster',
    name: '终末之敌',
    value: 0,
    image: '',
    hp: 0,
    maxHp: 30,
    attack: 5,
    fury: 1,
    currentLayer: 1,
    isFinalMonster: true,
    bossPhase: false,
    ...(over ?? {}),
  } as GameCardData;
}

function activeRowOf(...cards: (GameCardData | null)[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < cards.length && i < 5; i++) row[i] = cards[i];
  return row as unknown as ActiveRowSlots;
}

describe('最终之敌 → Boss 翻转：晕眩状态下仍然触发', () => {
  it('isStunned=true 时被杀，仍然变身为 Boss（bossPhase=true）', () => {
    const finalMonster = makeFinalMonster({ isStunned: true });
    const state = makeState({
      activeCards: activeRowOf(finalMonster),
      combatState: { ...initialCombatState, engagedMonsterIds: [finalMonster.id] },
    });

    const r = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: finalMonster.id });

    const slot0 = r.state.activeCards[0];
    expect(slot0).not.toBeNull();
    expect(slot0!.id).toBe(finalMonster.id);
    // Branch A 触发：原卡被替换为 Boss 形态
    expect(slot0!.bossPhase).toBe(true);
    // 不能走到 Branch C（实际击败），不会被打 defeatProcessed 标记
    expect(slot0!.defeatProcessed).toBeFalsy();
    // Boss 变身后从战斗中脱离（boss 重新接战是另一条路径）
    expect(r.state.combatState.engagedMonsterIds).not.toContain(finalMonster.id);

    // 应该 emit bossTransform 副作用
    expect(r.sideEffects).toContainEqual(
      expect.objectContaining({ event: 'combat:bossTransform' }),
    );
  });

  it('翻转出的 Boss 不残留旧形态的运行时 debuff（isStunned / specialAttackBoost / tempHpBoost / lowGoldBuffActive 全部清掉）', () => {
    const finalMonster = makeFinalMonster({
      isStunned: true,
      specialAttackBoost: 7,
      tempHpBoost: 3,
      lowGoldBuffActive: true,
      tempAttackBoost: 2, // tempAttackBoost 应该被累加 +5（保留旧设计），而不是清零
    });
    const state = makeState({
      activeCards: activeRowOf(finalMonster),
      combatState: { ...initialCombatState, engagedMonsterIds: [finalMonster.id] },
    });

    const r = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: finalMonster.id });
    const boss = r.state.activeCards[0]!;

    expect(boss.bossPhase).toBe(true);
    // 清掉的 debuff / 派生状态
    expect(boss.isStunned).toBe(false);
    expect(boss.specialAttackBoost).toBe(0);
    expect(boss.tempHpBoost).toBe(0);
    expect(boss.lowGoldBuffActive).toBe(false);
    expect(boss.defeatProcessed).toBe(false);
    // 保留：tempAttackBoost = 旧值 + 5（Boss 形态的固定加成）
    expect(boss.tempAttackBoost).toBe(2 + 5);
  });

  it('isStunned=false 时被杀，照样变身为 Boss（基线对照）', () => {
    const finalMonster = makeFinalMonster({ isStunned: false });
    const state = makeState({
      activeCards: activeRowOf(finalMonster),
      combatState: { ...initialCombatState, engagedMonsterIds: [finalMonster.id] },
    });

    const r = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: finalMonster.id });

    const slot0 = r.state.activeCards[0];
    expect(slot0!.bossPhase).toBe(true);
    expect(r.sideEffects).toContainEqual(
      expect.objectContaining({ event: 'combat:bossTransform' }),
    );
  });

  it('已经是 bossPhase 的卡再被杀：走 Branch C 实际击败（不再变身）', () => {
    // 防回归：去掉 `!isStunned` 守卫不能让 boss 自身陷入"反复变身"循环。
    const boss = makeFinalMonster({ bossPhase: true, isStunned: true });
    const state = makeState({
      activeCards: activeRowOf(boss),
      combatState: { ...initialCombatState, engagedMonsterIds: [boss.id] },
    });

    const r = reduce(state, { type: 'MONSTER_DEFEATED', monsterId: boss.id });

    const slot0 = r.state.activeCards[0];
    // Branch C 标记 defeatProcessed，等待动画后被清出 active row
    expect(slot0?.defeatProcessed).toBe(true);
    expect(r.sideEffects).toContainEqual(
      expect.objectContaining({ event: 'combat:monsterDefeated' }),
    );
    // 不再触发 boss 变身
    expect(r.sideEffects).not.toContainEqual(
      expect.objectContaining({ event: 'combat:bossTransform' }),
    );
  });
});
