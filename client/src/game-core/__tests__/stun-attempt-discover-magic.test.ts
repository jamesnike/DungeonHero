/**
 * Regression: 眩学之符 (`stun-attempt-discover`) 必须在所有 stun-attempt
 * dice 路径上 tick，而不只是武器 / 盾击的击晕判定。
 *
 * 原 bug：玩家用 雷涌一击 (`stun-cap-strike`) 时，眩学之符 计数器没有增加，
 * 因为只有 `combat.ts` 的 `PERFORM_HERO_ATTACK` / `PERFORM_SHIELD_BASH`
 * 在 push 击晕骰时 tick 了 `stunAttemptDiscoverProgress`。所有"魔法/侧击
 * 驱动"的 stun dice（雷震击 / 雷涌一击 / 侧击：击晕）都漏掉了。
 *
 * 修复：在 `rules/combat.ts` 暴露统一的 `tickStunAttemptDiscoverProgress`
 * helper，每个 push `ui:requestDice` 的位置都调一次。
 *
 * 本测试覆盖所有 5 个魔法驱动的击晕判定路径 + 武器/盾基线对照（确保没回归）。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import { STARTER_CARD_IDS } from '../deck';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

const stunAmulet = {
  id: 'a-stun', type: 'amulet' as const, name: '眩学之符', value: 0,
  amuletEffect: 'stun-attempt-discover' as const,
};

function makeMonster(id: string, hp = 50) {
  return {
    id, type: 'monster' as const, name: `M${id}`, value: hp,
    hp, maxHp: hp, attack: 0, currentLayer: hp, fury: hp,
  };
}

function activeRowOf(...monsters: any[]): ActiveRowSlots {
  const row: any[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

// ---------------------------------------------------------------------------
// 1) 雷涌一击 (stun-cap-strike) — user-reported bug
// ---------------------------------------------------------------------------

describe('stun-attempt-discover ticks for 雷涌一击 (stun-cap-strike)', () => {
  function makeStunCapCard(id = 'scs', extras: Record<string, any> = {}) {
    return {
      id: `magic-${id}`, type: 'magic' as const, name: '雷涌一击', value: 0,
      image: '', classCard: true,
      magicType: 'permanent' as const,
      magicEffect: 'test',
      knightEffect: 'stun-cap-strike',
      recycleDelay: 1,
      ...extras,
    };
  }

  it('PLAY_CARD + monster pick → progress increments by 1 per amulet', () => {
    const card = makeStunCapCard('one');
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      activeCards: activeRowOf(makeMonster('m1')),
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 2,
    });
    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-cap-strike', monsterId: 'm1' } as GameAction,
    ]);
    expect(after.state.stunAttemptDiscoverProgress).toBe(3);
  });

  it('2 amulets equipped → tick by 2 per dice (Progress counter stacking)', () => {
    const card = makeStunCapCard('stack');
    const stunAmulet2 = { ...stunAmulet, id: 'a-stun-2' };
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      activeCards: activeRowOf(makeMonster('m1')),
      amuletSlots: [stunAmulet, stunAmulet2] as any,
      stunAttemptDiscoverProgress: 1,
    });
    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-cap-strike', monsterId: 'm1' } as GameAction,
    ]);
    expect(after.state.stunAttemptDiscoverProgress).toBe(3);
  });

  it('crossing threshold 6 → progress resets to 0 + emits combat:stunAttemptDiscoverTriggered', () => {
    const card = makeStunCapCard('cross');
    const state = makeState({
      handCards: [card],
      stunCap: 40,
      activeCards: activeRowOf(makeMonster('m1')),
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 5,
    });
    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-cap-strike', monsterId: 'm1' } as GameAction,
    ]);
    expect(after.state.stunAttemptDiscoverProgress).toBe(0);
    expect(after.sideEffects.some((e: any) => e.event === 'combat:stunAttemptDiscoverTriggered')).toBe(true);
  });

  it('stunPct=0 (e.g. stunCap=0) → no dice fired → no tick', () => {
    const card = makeStunCapCard('nozero');
    const state = makeState({
      handCards: [card],
      stunCap: 0,
      activeCards: activeRowOf(makeMonster('m1')),
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 2,
    });
    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-cap-strike', monsterId: 'm1' } as GameAction,
    ]);
    expect(after.state.stunAttemptDiscoverProgress).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2) 雷震击 (stun-strike) — same bug class
// ---------------------------------------------------------------------------

describe('stun-attempt-discover ticks for 雷震击 (stun-strike)', () => {
  function makeStunStrike(idSuffix = 1) {
    return {
      id: `${STARTER_CARD_IDS.stunStrike}-pick-${idSuffix}`,
      type: 'magic' as const, name: '雷震击', value: 0,
      image: '',
      magicType: 'permanent' as const,
      magicEffect: 'test',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
    };
  }

  it('PLAY_CARD + monster pick → tick once for the initial dice', () => {
    const card = makeStunStrike(1);
    const state = makeState({
      handCards: [card] as any,
      stunCap: 40,
      activeCards: activeRowOf(makeMonster('m1')),
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 0,
    });
    const after = drain(state, [
      { type: 'PLAY_CARD', cardId: card.id } as GameAction,
      { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as GameAction,
    ]);
    expect(after.state.stunAttemptDiscoverProgress).toBeGreaterThanOrEqual(1);
  });

  it('multi-hit re-emit (RESOLVE_DICE → next dice) also ticks', () => {
    const state = makeState({
      stunCap: 40,
      activeCards: activeRowOf(makeMonster('m1')),
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 0,
    });
    // Simulate the multi-hit branch: currentHit=1, totalHits=3, miss outcome.
    // reduceDiceForHero re-pushes the next dice and must tick again.
    const result = reduce(state, {
      type: 'RESOLVE_DICE',
      sectionId: 'hero',
      value: 15,
      outcomeId: 'miss',
      context: {
        flowId: 'hero-stun',
        monsterId: 'm1',
        monsterName: 'Mm1',
        currentHit: 1,
        totalHits: 3,
        stunPct: 40,
        hitDmg: 2,
        magicCardId: 'magic-x',
      },
    } as GameAction);
    expect(result.state.stunAttemptDiscoverProgress).toBe(1);
    // Sanity: the re-emit pushed another dice request
    expect(result.sideEffects.some((e: any) => e.event === 'ui:requestDice')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3) 锋刃侧击 flank-stun branch (temp-attack-strike with isFlank)
// ---------------------------------------------------------------------------

describe('stun-attempt-discover ticks for 侧击：击晕 (flank-stun)', () => {
  it('flank stun dice fired → progress increments', () => {
    // Set up a temp-attack-strike resolved via RESOLVE_MAGIC_MONSTER_SELECTION
    // with isFlank=true, slot tempAttack > 0, monster present, stunCap > 0.
    // The simplest way is to seed pendingMagicAction and dispatch the resolve.
    const card = {
      id: 'magic-fs', type: 'magic' as const, name: '锋刃侧击', value: 0,
      image: '', classCard: true,
      magicType: 'permanent' as const,
      magicEffect: 'test',
      knightEffect: 'temp-attack-strike',
      recycleDelay: 1,
    };
    const monster = makeMonster('m1');
    const state = makeState({
      stunCap: 40,
      activeCards: activeRowOf(monster) as any,
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 0,
      slotTempAttack: { equipmentSlot1: 5, equipmentSlot2: 0 },
      equipmentSlot1: {
        id: 'w-fs', type: 'weapon' as const, name: 'TestSword', value: 1,
        durability: 2, maxDurability: 2,
      } as any,
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        isFlank: true,
        prompt: '',
      } as any,
    });
    const result = reduce(state, {
      type: 'RESOLVE_MAGIC_SLOT_SELECTION',
      slotId: 'equipmentSlot1',
    } as GameAction);
    expect(result.state.stunAttemptDiscoverProgress).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4) 天眼审判 (fate-sight) — 已改为劝降率加成卡，不再触发击晕骰子，所以在
//    stun-attempt-discover 进度链中不再出现。这里仅留一条 sanity 测试确保它
//    确实不会 tick progress。
// ---------------------------------------------------------------------------

describe('stun-attempt-discover does NOT tick for 天眼审判 (fate-sight)', () => {
  it('PLAY_CARD 天眼审判 不增加 stunAttemptDiscoverProgress', () => {
    const card = {
      id: 'magic-fate', type: 'magic' as const, name: '天眼审判', value: 0,
      image: '', classCard: true,
      magicType: 'permanent' as const,
      magicEffect: '透视牌堆顶 4 张，无怪物则获劝降率加成。',
      knightEffect: 'fate-sight',
      recycleDelay: 1,
    };
    const monsterCard = {
      id: 'deck-m', type: 'monster' as const, name: 'Goblin',
      value: 1, hp: 1, maxHp: 1, attack: 1,
    };
    const state = makeState({
      hand: [card] as any,
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 0,
      remainingDeck: [monsterCard, monsterCard, monsterCard, monsterCard] as any,
      stunCap: 60,
    });
    const result = reduce(state, { type: 'PLAY_CARD', cardId: card.id } as GameAction);
    expect(result.state.stunAttemptDiscoverProgress).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5) Baseline regression — make sure existing weapon / shield bash paths
//    still tick after refactoring to the shared helper.
// ---------------------------------------------------------------------------

describe('stun-attempt-discover baseline (weapon / shield bash) still works', () => {
  it('weapon stun-chance: tick happens (existing behavior preserved)', () => {
    const weapon = {
      id: 'w-stun', type: 'weapon' as const, name: 'StunSword', value: 5,
      durability: 2, maxDurability: 2,
      weaponStunChance: 100,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 5, maxHp: 5, attack: 1, currentLayer: 5, fury: 5,
    };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 2,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      } as any,
    });
    const drained = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);
    expect(drained.state.stunAttemptDiscoverProgress).toBe(3);
  });

  it('shield bash threshold reached: triggers + resets', () => {
    const shield = {
      id: 's-bash', type: 'shield' as const, name: 'BashShield', value: 3,
      durability: 3, maxDurability: 3, armorMax: 3,
      shieldBashStunRate: 50,
      shieldBashUnlimited: true,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm-stun', type: 'monster' as const, name: 'Boss', value: 9,
      hp: 9, maxHp: 9, attack: 1, currentLayer: 9, fury: 9,
    };
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 5,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-stun'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });
    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-stun',
      diceRoll: 20,
    });
    expect(result.state.stunAttemptDiscoverProgress).toBe(0);
    expect(
      result.sideEffects.some((e: any) => e.event === 'combat:stunAttemptDiscoverTriggered'),
    ).toBe(true);
  });
});
