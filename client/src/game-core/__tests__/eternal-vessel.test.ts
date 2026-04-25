/**
 * 永恒之器 (knight:eternal-vessel) — Perm 2 magic.
 *
 * 卡面：永久（Perm 2）。失去 3 HP（自伤），生命上限永久 +3。无目标，立即结算。
 *
 * 公式：
 *   hpCost  = 3 * echoMultiplier
 *   hpBoost = 3 * echoMultiplier   （写入 patch.permanentMaxHpBonus += hpBoost）
 *
 * - HP 自伤走 APPLY_DAMAGE selfInflicted（与 血誓回卷 / 血金术 / 紧急回收 同管线）
 *   → 触发 血怒 / 复生赐福 / self-damage-draw / totalDamageTaken / 护甲吸血 等所有自伤联动
 *   → 可被 tempShield 吸收
 *   → 可被 death-ward 救场
 *   → hp ≤ cost 时仍然致死（playable at any HP, may kill you）
 * - permanentMaxHpBonus 是 maxHp 的来源之一（参考 combat.ts:519、magic-effects.ts:250）；
 *   用 patch 直接累加是与「精金强化药 / spell-lifesteal+1-maxhp+6」一致的写法
 * - Echo（A 类，与 血誓回卷 一致）：HP 损失 与 maxHp +N 双双 ×echoMultiplier
 * - Perm 2 magic：play 后入回收袋（不进坟场）
 * - 不设升级（maxUpgradeLevel: 0）
 *
 * 覆盖：
 *   1. 基础：hp 30 → 27，permanentMaxHpBonus 0 → 3
 *   2. 已有 maxHp bonus 时叠加：bonus 5 → 8，hp 同步 -3
 *   3. Echo ×2：hp -6，bonus +6，doubleNextMagic 消耗
 *   4. 两次连续使用：bonus 累加 (3 → 6)，hp 累计 -6
 *   5. 自伤计入 totalDamageTaken
 *   6. tempShield 吸收：hp 不掉，但 maxHp 仍然 +3
 *   7. Perm 2 处置：play 后入回收袋（不进坟场）
 *   8. Phase 'playerInput'：pipeline drain 完整跑完（参考 pipeline-input-continuation.mdc）
 *   9. hp ≤ cost：致死（gameOver = true，victory = false）
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'ev'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '永恒之器',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：失去 3 生命，生命上限永久 +3。',
    knightEffect: 'eternal-vessel',
    description: 'test',
    recycleDelay: 2,
  } as any;
}

// ---------------------------------------------------------------------------
// 主公式
// ---------------------------------------------------------------------------

describe('永恒之器 — 主公式', () => {
  it('基础：hp 30 → 27，permanentMaxHpBonus 0 → 3', () => {
    const card = makeCard('basic');
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(27);
    expect(result.state.permanentMaxHpBonus).toBe(3);
  });

  it('已有 bonus 时叠加：5 → 8，hp -3', () => {
    const card = makeCard('stack');
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 5,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(27);
    expect(result.state.permanentMaxHpBonus).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 法术回响（A 类：HP 与 maxHp +N 双双 ×echo）
// ---------------------------------------------------------------------------

describe('永恒之器 — 法术回响', () => {
  it('Echo ×2：hp -6，permanentMaxHpBonus +6，doubleNextMagic 消耗', () => {
    const card = makeCard('echo');
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      doubleNextMagic: true,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(24);
    expect(result.state.permanentMaxHpBonus).toBe(6);
    expect(result.state.doubleNextMagic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 多次叠加（确认 patch 是 += 而不是 =）
// ---------------------------------------------------------------------------

describe('永恒之器 — 累计叠加', () => {
  it('两次使用：permanentMaxHpBonus 0 → 3 → 6，hp 累计 -6', () => {
    const card1 = makeCard('first');
    const card2 = makeCard('second');
    const state = makeState({
      handCards: [card1, card2],
      hp: 30,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });

    const after1 = drain(state, [{ type: 'PLAY_CARD', cardId: card1.id } as GameAction]);
    expect(after1.state.hp).toBe(27);
    expect(after1.state.permanentMaxHpBonus).toBe(3);

    const after2 = drain(after1.state, [
      { type: 'PLAY_CARD', cardId: card2.id } as GameAction,
    ]);
    expect(after2.state.hp).toBe(24);
    expect(after2.state.permanentMaxHpBonus).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 自伤联动
// ---------------------------------------------------------------------------

describe('永恒之器 — 自伤联动', () => {
  it('HP 损失计入 totalDamageTaken（自伤走 selfInflicted）', () => {
    const card = makeCard('self-track');
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      totalDamageTaken: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(27);
    expect(result.state.totalDamageTaken).toBe(3);
  });

  it('tempShield 吸收 3 点：hp 不变，但 permanentMaxHpBonus 仍 +3', () => {
    // 自伤走 reduceApplyDamage → tempShield 先扣（与 血誓回卷 / 血金术 一致）。
    // maxHp +3 是直接 patch，不依赖 appliedDamage，所以护盾抵消不影响。
    const card = makeCard('shield');
    const state = makeState({
      handCards: [card],
      hp: 30,
      tempShield: 5,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(30);
    expect(result.state.tempShield).toBe(2);
    expect(result.state.permanentMaxHpBonus).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 处置（Perm 2 → 回收袋）
// ---------------------------------------------------------------------------

describe('永恒之器 — 处置', () => {
  it('Perm 2 magic：play 后入回收袋（不进坟场，不在手）', () => {
    const card = makeCard('perm');
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(false);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 致死边界（playable at any HP, may kill you）
// ---------------------------------------------------------------------------

describe('永恒之器 — 致死边界', () => {
  it('hp ≤ cost：仍可结算，触发 gameOver', () => {
    // 跟 血誓回卷 / 血金术 一致：自伤不内置 lethal-protection。
    // 玩家手上没有 death-ward 的话，hp ≤ 3 用永恒之器会死。
    const card = makeCard('lethal');
    const state = makeState({
      handCards: [card],
      hp: 2,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(0);
    expect(result.state.gameOver).toBe(true);
    expect(result.state.victory).toBe(false);
  });
});
