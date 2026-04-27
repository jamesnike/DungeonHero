/**
 * 附魔祭坛 / 赋能神殿 — 「侧击：+3 金币」 / 「侧击：恢复 2 HP」 grant 流程。
 *
 * 历史背景：早期实现挂在「转型」上（`grantTransformGold:3` / `grantTransformHeal:2`，
 * 通过 transformBonus / transformEffect 触发），现已迁移为「侧击」触发——放在手牌最左 /
 * 最右位置打出时生效。
 *
 * 涉及的迁移点：
 *   - event token `grantTransformGold:3` → `grantFlankGold:3`
 *   - event token `grantTransformHeal:2` → `grantFlankHeal:2`
 *   - PermGrantModal sourceType `transform-gold-grant` → `flank-gold-grant`
 *   - PermGrantModal sourceType `transform-heal-grant` → `flank-heal-grant`
 *   - reduceResolvePermGrant 现在写 `flankEffect` / `flankEffectId: 'gold:N' / 'heal:N'`
 *     而不再写 `transformBonus` / `transformEffect`
 *   - reducePlayCard 在 isFlank 分支命中 `flankEffectId.startsWith('gold:')` 时直接
 *     +N 金币；命中 `'heal:'` 时 enqueue HEAL action
 *   - GameBoard.tsx 拖放 imperative 链亦同步加分支（保持双轨一致）
 *
 * 同时验证：保留旧的「转型 +N 金币 / 恢复 N HP」分支（`reduceApplyTransformCategory`
 * 仍处理 transformEffect: 'gold:N' / 'heal:N'）以兼容旧存档（这条不在本测试覆盖；
 * 在 `transform-after-event.test.ts` 等老测试里）。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

function makeMagicCard(id: string, name = `Magic-${id}`): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    image: '',
  } as GameCardData;
}

describe('附魔祭坛 / 赋能神殿 — 侧击：+N 金币 / 恢复 N HP grant', () => {
  describe('reduceResolvePermGrant：modal.sourceType = flank-gold-grant', () => {
    it('mutates target hand card with flankEffect "+3 金币" + flankEffectId "gold:3"', () => {
      const target = makeMagicCard('t1', '查阅动作');
      const filler = makeMagicCard('filler');
      const state = makeState({
        handCards: [target, filler],
        permGrantModal: {
          sourceCardId: 'event-grant',
          sourceType: 'flank-gold-grant',
          meta: { amount: 3 },
        },
      });

      const result = reduce(state, {
        type: 'RESOLVE_PERM_GRANT',
        targetCardId: target.id,
      } as GameAction);

      const updated = result.state.handCards.find(c => c.id === target.id) as any;
      expect(updated.flankEffect).toBe('+3 金币');
      expect(updated.flankEffectId).toBe('gold:3');
      expect((updated as any).transformBonus).toBeUndefined();
      expect((updated as any).transformEffect).toBeUndefined();
      expect(result.state.permGrantModal).toBeNull();
    });
  });

  describe('reduceResolvePermGrant：modal.sourceType = flank-heal-grant', () => {
    it('mutates target hand card with flankEffect "恢复 2 HP" + flankEffectId "heal:2"', () => {
      const target = makeMagicCard('t1', '查阅动作');
      const filler = makeMagicCard('filler');
      const state = makeState({
        handCards: [target, filler],
        permGrantModal: {
          sourceCardId: 'event-grant',
          sourceType: 'flank-heal-grant',
          meta: { amount: 2 },
        },
      });

      const result = reduce(state, {
        type: 'RESOLVE_PERM_GRANT',
        targetCardId: target.id,
      } as GameAction);

      const updated = result.state.handCards.find(c => c.id === target.id) as any;
      expect(updated.flankEffect).toBe('恢复 2 HP');
      expect(updated.flankEffectId).toBe('heal:2');
      expect((updated as any).transformBonus).toBeUndefined();
      expect((updated as any).transformEffect).toBeUndefined();
      expect(result.state.permGrantModal).toBeNull();
    });
  });

  describe('PLAY_CARD with flankEffectId "gold:3"', () => {
    it('源卡在最左 → 侧击触发，gold +3', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-1', '查阅动作'),
        flankEffect: '+3 金币',
        flankEffectId: 'gold:3',
      } as GameCardData;
      const filler1 = makeMagicCard('f1');
      const filler2 = makeMagicCard('f2');
      const state = makeState({
        gold: 10,
        handCards: [card, filler1, filler2],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.gold).toBe(13);
    });

    it('源卡在最右 → 侧击触发，gold +3', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-2', '查阅动作'),
        flankEffect: '+3 金币',
        flankEffectId: 'gold:3',
      } as GameCardData;
      const filler1 = makeMagicCard('f1');
      const filler2 = makeMagicCard('f2');
      const state = makeState({
        gold: 10,
        handCards: [filler1, filler2, card],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.gold).toBe(13);
    });

    it('源卡在中间位置（非 flank）→ 侧击不触发，gold 不变', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-3', '查阅动作'),
        flankEffect: '+3 金币',
        flankEffectId: 'gold:3',
      } as GameCardData;
      const filler1 = makeMagicCard('f1');
      const filler2 = makeMagicCard('f2');
      const state = makeState({
        gold: 10,
        handCards: [filler1, card, filler2],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.gold).toBe(10);
    });
  });

  describe('PLAY_CARD with flankEffectId "heal:2"', () => {
    // INITIAL_HP = 20 默认 maxHp。测试 fixture 把 hp 设低到留出 heal 空间。
    it('源卡在最左 → 侧击触发，hp +2（不超过 maxHp）', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-4', '查阅动作'),
        flankEffect: '恢复 2 HP',
        flankEffectId: 'heal:2',
      } as GameCardData;
      const filler1 = makeMagicCard('f1');
      const filler2 = makeMagicCard('f2');
      const state = makeState({
        hp: 5,
        handCards: [card, filler1, filler2],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.hp).toBe(7);
    });

    it('源卡在最右 → 侧击触发，hp +2', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-5', '查阅动作'),
        flankEffect: '恢复 2 HP',
        flankEffectId: 'heal:2',
      } as GameCardData;
      const filler1 = makeMagicCard('f1');
      const filler2 = makeMagicCard('f2');
      const state = makeState({
        hp: 5,
        handCards: [filler1, filler2, card],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.hp).toBe(7);
    });

    it('源卡在中间位置（非 flank）→ 侧击不触发，hp 不变', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-6', '查阅动作'),
        flankEffect: '恢复 2 HP',
        flankEffectId: 'heal:2',
      } as GameCardData;
      const filler1 = makeMagicCard('f1');
      const filler2 = makeMagicCard('f2');
      const state = makeState({
        hp: 5,
        handCards: [filler1, card, filler2],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.hp).toBe(5);
    });

    it('hp 已满时 heal 不会溢出（被 computeHeal clamp 到 maxHp = INITIAL_HP=20）', () => {
      const card: GameCardData = {
        ...makeMagicCard('survey-7', '查阅动作'),
        flankEffect: '恢复 2 HP',
        flankEffectId: 'heal:2',
      } as GameCardData;
      const filler = makeMagicCard('f1');
      const state = makeState({
        hp: 19,
        handCards: [card, filler],
      });

      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

      expect(result.state.hp).toBe(20);
    });
  });

  describe('end-to-end：grant via event token → play from flank → effect fires', () => {
    it('grantFlankGold:3 token → 选中手牌 → flank 打出 → +3 金币', () => {
      const target = makeMagicCard('t1', '查阅动作');
      const filler = makeMagicCard('f1');
      let state = makeState({
        gold: 10,
        handCards: [target, filler],
      });

      // 1) Event 系统弹出 PermGrantModal（这一步在 useEventSystem 里做，
      //    我们直接 mutate state.permGrantModal 模拟之后的状态）。
      state = {
        ...state,
        permGrantModal: {
          sourceCardId: 'event-grant',
          sourceType: 'flank-gold-grant',
          meta: { amount: 3 },
        },
      };

      // 2) 玩家选中目标手牌 → RESOLVE_PERM_GRANT。
      const afterGrant = reduce(state, {
        type: 'RESOLVE_PERM_GRANT',
        targetCardId: target.id,
      } as GameAction);
      const granted = afterGrant.state.handCards.find(c => c.id === target.id) as any;
      expect(granted.flankEffectId).toBe('gold:3');

      // 3) 玩家把这张卡放在最左位置打出 → +3 金币。
      const result = drain(
        { ...afterGrant.state, phase: 'playerInput' as const },
        [{ type: 'PLAY_CARD', cardId: target.id } as GameAction],
      );
      expect(result.state.gold).toBe(13);
    });

    it('grantFlankHeal:2 token → 选中手牌 → flank 打出 → +2 HP', () => {
      const target = makeMagicCard('t1', '查阅动作');
      const filler = makeMagicCard('f1');
      let state = makeState({
        hp: 5,
        handCards: [target, filler],
      });

      state = {
        ...state,
        permGrantModal: {
          sourceCardId: 'event-grant',
          sourceType: 'flank-heal-grant',
          meta: { amount: 2 },
        },
      };

      const afterGrant = reduce(state, {
        type: 'RESOLVE_PERM_GRANT',
        targetCardId: target.id,
      } as GameAction);
      const granted = afterGrant.state.handCards.find(c => c.id === target.id) as any;
      expect(granted.flankEffectId).toBe('heal:2');

      const result = drain(
        { ...afterGrant.state, phase: 'playerInput' as const },
        [{ type: 'PLAY_CARD', cardId: target.id } as GameAction],
      );
      expect(result.state.hp).toBe(7);
    });
  });
});
