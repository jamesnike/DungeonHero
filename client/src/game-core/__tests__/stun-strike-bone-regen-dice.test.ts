/**
 * Regression: 雷震击 (stun-strike) 打 bone-regen 精英 (Skeleton) 时，
 * 击晕掷骰子和骸生掷骰子必须同时被 reducer 产出（作为两个独立 side
 * effects）。修复前 hook 端的 requestDiceOutcome 单槽实现会让后到的
 * boneRegenCheck 覆盖先到的 ui:requestDice (hero-stun)，玩家只看到虚骨再
 * 生的骰子，stun 的 RESOLVE_DICE 永远不会触发，怪物也无法被击晕。
 *
 * 本测试只覆盖 reducer 端：保证两个 side effect 都在那里发出。hook 端
 * 队列化的回归测试见 client/src/hooks/__tests__/dice-queue.test.tsx。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import { STARTER_CARD_IDS } from '../deck';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeStunStrike(idSuffix = 1) {
  return {
    id: `${STARTER_CARD_IDS.stunStrike}-pick-${idSuffix}`,
    type: 'magic' as const,
    name: '雷震击',
    value: 0,
    image: '',
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：对一个怪物造成 1 点伤害 2 次，每次 20% 击晕。',
    description: '对一个怪物造成 1 点法术伤害 2 次，每次有 20% 概率击晕目标。',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
  };
}

function makeBoneRegenMonster(id: string, hpPerLayer = 2, layers = 3) {
  return {
    id,
    type: 'monster' as const,
    name: 'Elite Skeleton',
    value: hpPerLayer,
    hp: hpPerLayer,
    maxHp: hpPerLayer,
    attack: 0,
    currentLayer: layers,
    fury: layers,
    hpLayers: layers,
    monsterType: 'Skeleton',
    monsterSpecial: 'bone-regen',
  };
}

function activeRowOf(...monsters: any[]): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

describe('雷震击 + bone-regen — both dice side effects must be emitted', () => {
  it('stun-strike on a bone-regen Skeleton produces BOTH ui:requestDice (hero-stun) AND combat:boneRegenCheck', () => {
    const card = makeStunStrike(1);
    // hp per layer = 2, 3 layers — Lv0 stun-strike does 1×2=2 damage which
    // strips one layer (3→2) and triggers the non-forced bone-regen path.
    const state = makeState({
      handCards: [card] as any,
      stunCap: 20,
      activeCards: activeRowOf(makeBoneRegenMonster('m1', 2, 3)) as any,
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state as any).pendingMagicAction).toBeTruthy();

    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);

    const allEffects = [...afterPlay.sideEffects, ...result.sideEffects];

    const stunDice = allEffects.find(
      e => e.event === 'ui:requestDice'
        && (e.payload as any)?.context?.flowId === 'hero-stun',
    );
    const boneRegenDice = allEffects.find(e => e.event === 'combat:boneRegenCheck');

    expect(stunDice, 'stun-strike must request hero-stun dice').toBeTruthy();
    expect(boneRegenDice, 'bone-regen monster must request bone-regen dice').toBeTruthy();

    // The stun dice must target the same monster
    expect((stunDice as any).payload.context.monsterId).toBe('m1');
    expect((boneRegenDice as any).payload.monsterId).toBe('m1');

    // Both must carry a predetermined roll (1..20)
    expect((stunDice as any).payload.predeterminedRoll).toBeGreaterThanOrEqual(1);
    expect((stunDice as any).payload.predeterminedRoll).toBeLessThanOrEqual(20);
    expect((boneRegenDice as any).payload.predeterminedRoll).toBeGreaterThanOrEqual(1);
    expect((boneRegenDice as any).payload.predeterminedRoll).toBeLessThanOrEqual(20);
  });

  it('does NOT request bone-regen dice when the monster is already stunned (sanity check on reducer gating)', () => {
    const card = makeStunStrike(2);
    const monster = { ...makeBoneRegenMonster('m1', 2, 3), isStunned: true };
    const state = makeState({
      handCards: [card] as any,
      stunCap: 20,
      activeCards: activeRowOf(monster) as any,
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);

    const allEffects = [...afterPlay.sideEffects, ...result.sideEffects];

    const stunDice = allEffects.find(
      e => e.event === 'ui:requestDice'
        && (e.payload as any)?.context?.flowId === 'hero-stun',
    );
    const boneRegenDice = allEffects.find(e => e.event === 'combat:boneRegenCheck');

    // Monster already stunned → no stun dice (per hero.ts gating)
    expect(stunDice).toBeFalsy();
    // bone-regen also gated on !isStunned
    expect(boneRegenDice).toBeFalsy();
  });
});
