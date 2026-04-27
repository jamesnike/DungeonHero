/**
 * 不灭守护 (knight:death-ward) — auto-trigger on lethal damage.
 *
 * 设计契约（参见 reduceApplyDamage in rules/combat.ts）：
 *   - 玩家受到致死伤害时，如果手牌里至少有一张 magicEffect/knightEffect ='death-ward'，
 *     reducer 自动消耗第一张这种卡：
 *       1. 卡从 handCards 移到 discardedCards（坟场）— 必须过 resetCardForGraveyard
 *       2. hp / tempShield / 其它伤害字段 **不变**（伤害被完全抵消）
 *       3. 设置 deathWardNotice = { cardName, blockedDamage }
 *       4. phase 切到 'awaitingDeathWardNotice'，pipeline 暂停
 *       5. 发出 combat:deathWardActivated side effect（UI 反馈用）
 *   - 玩家点「知道了」→ DISMISS_DEATH_WARD_NOTICE 把 deathWardNotice 清空、
 *     phase 回到 'playerInput'，pipeline 继续 drain。
 *   - 不能被玩家手动 PLAY_CARD（reducePlayCard 已加 guard）。
 *   - 死亡触发后**没有**升级版（不再写入 magicType=permanent / recycleDelay）：
 *     这张卡是一次性的，触发后永远进坟场。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeDeathWardCard(idSuffix = 'dw'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '不灭守护',
    value: 0,
    image: '',
    classCard: true,
    description: '受到致死伤害时自动触发，抵消该次伤害；触发后从手牌进入坟场。',
    magicType: 'instant',
    magicEffect: 'death-ward',
    knightEffect: 'death-ward',
  } as any;
}

describe('不灭守护 auto-trigger', () => {
  it('lethal damage with death-ward in hand: card → graveyard, hp unchanged, notice set', () => {
    const card = makeDeathWardCard();
    const state = makeState({ hp: 5, handCards: [card] as any, discardedCards: [] });
    const result = drain(state, [{ type: 'APPLY_DAMAGE', amount: 999, source: 'monster' }]);

    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeDefined();
    expect(result.state.hp).toBe(5);
    expect((result.state as any).deathWardNotice).toEqual({
      cardName: '不灭守护',
      blockedDamage: 999,
    });
    expect(result.state.phase).toBe('awaitingDeathWardNotice');
    expect(result.sideEffects.some(se => se.event === 'combat:deathWardActivated')).toBe(true);
  });

  it('non-lethal damage: death-ward stays in hand, hp drops normally', () => {
    const card = makeDeathWardCard();
    const state = makeState({ hp: 10, handCards: [card] as any, discardedCards: [] });
    const result = drain(state, [{ type: 'APPLY_DAMAGE', amount: 3, source: 'monster' }]);

    expect(result.state.handCards.find(c => c.id === card.id)).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.hp).toBe(7);
    expect((result.state as any).deathWardNotice).toBeNull();
    expect(result.state.phase).toBe('playerInput');
  });

  it('lethal damage with NO death-ward in hand: hp goes to 0 (no save)', () => {
    const state = makeState({ hp: 5, handCards: [] as any, discardedCards: [] });
    const result = drain(state, [{ type: 'APPLY_DAMAGE', amount: 999, source: 'monster' }]);

    expect(result.state.hp).toBe(0);
    expect((result.state as any).deathWardNotice).toBeNull();
  });

  it('multiple death-wards in hand: only the first one is consumed', () => {
    const card1 = makeDeathWardCard('dw1');
    const card2 = makeDeathWardCard('dw2');
    const state = makeState({ hp: 5, handCards: [card1, card2] as any, discardedCards: [] });
    const result = drain(state, [{ type: 'APPLY_DAMAGE', amount: 999, source: 'monster' }]);

    expect(result.state.handCards.find(c => c.id === card1.id)).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === card2.id)).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === card1.id)).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === card2.id)).toBeUndefined();
  });

  it('DISMISS_DEATH_WARD_NOTICE clears notice and reverts phase to playerInput', () => {
    const card = makeDeathWardCard();
    let state = makeState({ hp: 5, handCards: [card] as any });
    state = drain(state, [{ type: 'APPLY_DAMAGE', amount: 999, source: 'monster' }]).state;
    expect(state.phase).toBe('awaitingDeathWardNotice');
    expect((state as any).deathWardNotice).not.toBeNull();

    const result = reduce(state, { type: 'DISMISS_DEATH_WARD_NOTICE' });
    expect((result.state as any).deathWardNotice).toBeNull();
    expect(result.state.phase).toBe('playerInput');
  });

  it('PLAY_CARD on death-ward is a no-op (manual play blocked)', () => {
    const card = makeDeathWardCard();
    const state = makeState({ hp: 30, handCards: [card] as any, discardedCards: [] });
    const result = reduce(state, { type: 'PLAY_CARD', cardId: card.id });

    expect(result.state.handCards.find(c => c.id === card.id)).toBeDefined();
    expect(result.state.discardedCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.hp).toBe(30);
  });

  it('death-ward in backpack does NOT save the player (only hand triggers)', () => {
    const card = makeDeathWardCard();
    const state = makeState({
      hp: 5,
      handCards: [] as any,
      backpackItems: [card] as any,
      discardedCards: [],
    });
    const result = drain(state, [{ type: 'APPLY_DAMAGE', amount: 999, source: 'monster' }]);

    expect(result.state.hp).toBe(0);
    expect(result.state.backpackItems.find(c => c.id === card.id)).toBeDefined();
    expect((result.state as any).deathWardNotice).toBeNull();
  });
});
