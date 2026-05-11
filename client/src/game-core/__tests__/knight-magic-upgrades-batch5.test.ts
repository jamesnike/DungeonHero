/**
 * Knight 专属 Magic 升级 — 第 5 批 2 张卡 × 多 consumer 路径覆盖
 *
 * 验证矩阵（per `shared-effect-id-impact-check.mdc`：每张卡的所有 consumer 路径都要测）：
 *
 *   亡者之契 (monster-recruit):
 *     - 路径 A (handler，描述): upgrades.ts monsterRecruit
 *     - 路径 B (resolver / state mutation): magic-effects.ts resolveMonsterRecruit
 *       (recruitCounts 表)
 *     - 不变行为：坟场不足时坍塌取尽；坟场为空 banner；非怪物不会被取
 *
 *   孤注一掷 (berserk-gambit):
 *     - 路径 A (handler，描述): upgrades.ts berserkGambit (新版只到 L1)
 *     - 路径 B (legacy switch): magic-effects.ts case 'berserk-gambit'
 *       (extraPerSlotAmounts 表 / 已删除 ADD_BERSERK_BUFF)
 *     - 路径 C (schema resolver): magic.ts knightBerserkGambit
 *       (echoMultiplier 仅作用于 extraPerSlot)
 *     - 不变行为：HP→1；旧存档 upgradeLevel ≥ 1 全部按 L1 处理（向后兼容）
 *
 * 参数表：
 *   - monster-recruit:    recruitCounts = [2, 3]            (maxUpgradeLevel = 1)
 *   - berserk-gambit:     extraPerSlotAmounts = [2, 3]      (maxUpgradeLevel = 1)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resolveUpgradeEffectId } from '../card-schema';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...(overrides ?? {}) };
}

// Helpers --------------------------------------------------------------------

function makeMonster(id: string, name: string = `M-${id}`): GameCardData {
  return {
    id,
    name,
    type: 'monster',
    value: 0,
    attack: 1,
    hp: 1,
    fury: 1,
    hpLayers: 1,
  } as any;
}

function makePotion(id: string, name: string = `P-${id}`): GameCardData {
  return {
    id,
    name,
    type: 'potion',
    value: 0,
  } as any;
}

// ===========================================================================
// 亡者之契 (monster-recruit)
// ===========================================================================

describe('亡者之契 (monster-recruit) — routing', () => {
  it('routes to knight:monster-recruit via knightEffect field', () => {
    const card: GameCardData = {
      id: 'mr-route',
      type: 'magic',
      name: '亡者之契',
      value: 0,
      knightEffect: 'monster-recruit',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:monster-recruit');
  });
});

describe('亡者之契 (monster-recruit) — handler description updates', () => {
  function mrL0(): GameCardData {
    return {
      id: 'mr-handler',
      type: 'magic',
      name: '亡者之契',
      value: 0,
      classCard: true,
      magicType: 'instant' as any,
      description: '一次性：从坟场随机获得两张怪物牌，加入手牌。',
      shortDescription: '从坟场随机获得 2 张怪物牌',
      magicEffect: '从坟场随机获得两张怪物牌。',
      knightEffect: 'monster-recruit',
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 描述从「两张」改为「三张」', () => {
    const card = mrL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('三张');
    expect(upgraded.description).not.toContain('两张');
    expect(upgraded.shortDescription).toContain('3 张');
    expect(upgraded.magicEffect).toContain('三张');
  });
});

describe('亡者之契 (monster-recruit) — resolver scaling', () => {
  function mrCard(level: number): GameCardData {
    return {
      id: 'mr-cast',
      type: 'magic',
      name: '亡者之契',
      value: 0,
      classCard: true,
      magicType: 'instant' as any,
      description: '...',
      magicEffect: '...',
      knightEffect: 'monster-recruit',
      maxUpgradeLevel: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0: 坟场怪物足够时取出 2 张到手牌', () => {
    const card = mrCard(0);
    const monsters = [
      makeMonster('m1'),
      makeMonster('m2'),
      makeMonster('m3'),
      makeMonster('m4'),
    ];
    const state = makeState({
      handCards: [card],
      discardedCards: monsters as any,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const handMonsters = result.state.handCards.filter(c => c.type === 'monster');
    expect(handMonsters).toHaveLength(2);
    // 取出的怪物已从坟场移除
    const remainingMonsters = (result.state.discardedCards ?? []).filter(c => c.type === 'monster');
    expect(remainingMonsters).toHaveLength(2);
  });

  it('L1: 坟场怪物足够时取出 3 张到手牌', () => {
    const card = mrCard(1);
    const monsters = [
      makeMonster('m1'),
      makeMonster('m2'),
      makeMonster('m3'),
      makeMonster('m4'),
      makeMonster('m5'),
    ];
    const state = makeState({
      handCards: [card],
      discardedCards: monsters as any,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const handMonsters = result.state.handCards.filter(c => c.type === 'monster');
    expect(handMonsters).toHaveLength(3);
    const remainingMonsters = (result.state.discardedCards ?? []).filter(c => c.type === 'monster');
    expect(remainingMonsters).toHaveLength(2);
  });

  it('L1: 坟场怪物不足 3 张时取出全部', () => {
    const card = mrCard(1);
    const monsters = [makeMonster('m1'), makeMonster('m2')];
    const state = makeState({
      handCards: [card],
      discardedCards: monsters as any,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const handMonsters = result.state.handCards.filter(c => c.type === 'monster');
    expect(handMonsters).toHaveLength(2);
    const remainingMonsters = (result.state.discardedCards ?? []).filter(c => c.type === 'monster');
    expect(remainingMonsters).toHaveLength(0);
  });

  it('L1: 坟场无怪物时不抛错（banner 提示）', () => {
    const card = mrCard(1);
    const state = makeState({
      handCards: [card],
      discardedCards: [makePotion('p1')] as any, // 非怪物不应被取
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const handMonsters = result.state.handCards.filter(c => c.type === 'monster');
    expect(handMonsters).toHaveLength(0);
    // 坟场里非怪物没动
    expect((result.state.discardedCards ?? []).find(c => c.id === 'p1')).toBeDefined();
  });

  it('L1: 不会取走非怪物牌（仅怪物）', () => {
    const card = mrCard(1);
    const items = [
      makeMonster('m1'),
      makePotion('p1'),
      makeMonster('m2'),
      makePotion('p2'),
      makeMonster('m3'),
    ];
    const state = makeState({
      handCards: [card],
      discardedCards: items as any,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const handMonsters = result.state.handCards.filter(c => c.type === 'monster');
    expect(handMonsters).toHaveLength(3);
    // 两张 potion 仍在坟场
    const remainingPotions = (result.state.discardedCards ?? []).filter(c => c.type === 'potion');
    expect(remainingPotions).toHaveLength(2);
  });

  it('maxUpgradeLevel=1：超过 1 时不再升级', () => {
    const card = { ...mrCard(1), id: 'mr-cap' } as any;
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    // L1 已经是上限：reducer 应该 noop / 保持 L1
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
  });
});

// ===========================================================================
// 孤注一掷 (berserk-gambit)
// ===========================================================================

describe('孤注一掷 (berserk-gambit) — routing', () => {
  it('routes to knight:berserk-gambit via knightEffect field', () => {
    const card: GameCardData = {
      id: 'bg-route',
      type: 'magic',
      name: '孤注一掷',
      value: 0,
      knightEffect: 'berserk-gambit',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:berserk-gambit');
  });
});

describe('孤注一掷 (berserk-gambit) — handler description updates', () => {
  function bgL0(): GameCardData {
    return {
      id: 'bg-handler',
      type: 'magic',
      name: '孤注一掷',
      value: 0,
      classCard: true,
      magicType: 'instant' as any,
      description: '一次性：生命降至 1，每个武器栏可多攻击2 次。',
      shortDescription: '生命降至 1；每个武器栏多攻击2 次',
      magicEffect: '降血换取每栏额外攻击。',
      knightEffect: 'berserk-gambit',
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 多攻击次数从「2 次」改为「3 次」', () => {
    const card = bgL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('多攻击3 次');
    // 不再含「多攻击2 次」（L0 已变成 2，L1 必须升到 3）
    expect(upgraded.description).not.toContain('多攻击2 次');
    // 旧的 +4/+8 装备伤害已彻底删除
    expect(upgraded.description).not.toContain('+4');
    expect(upgraded.description).not.toContain('+8');
    expect(upgraded.description).not.toContain('装备');
  });
});

describe('孤注一掷 (berserk-gambit) — resolver scaling (HP→1 + extraPerSlot)', () => {
  function bgCard(level: number): GameCardData {
    return {
      id: 'bg-cast',
      type: 'magic',
      name: '孤注一掷',
      value: 0,
      classCard: true,
      magicType: 'instant' as any,
      description: '...',
      magicEffect: '...',
      knightEffect: 'berserk-gambit',
      maxUpgradeLevel: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0: HP→1, extraPerSlot=2, gambitExtraActive=true', () => {
    const card = bgCard(0);
    const state = makeState({
      handCards: [card],
      hp: 10,
      maxHp: 12,
      gambitExtraActive: false,
      gambitExtraPerSlot: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(1);
    expect(result.state.gambitExtraActive).toBe(true);
    expect(result.state.gambitExtraPerSlot).toBe(2);
  });

  it('L1: HP→1, extraPerSlot=3', () => {
    const card = bgCard(1);
    const state = makeState({
      handCards: [card],
      hp: 10,
      maxHp: 12,
      gambitExtraActive: false,
      gambitExtraPerSlot: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(1);
    expect(result.state.gambitExtraActive).toBe(true);
    expect(result.state.gambitExtraPerSlot).toBe(3);
  });

  it('L1: 不再写 berserkTurnBuff（旧的 +4/+8 已删除）', () => {
    const card = bgCard(1);
    const state = makeState({
      handCards: [card],
      hp: 10,
      maxHp: 12,
      berserkTurnBuff: { equipmentSlot1: 0, equipmentSlot2: 0 } as any,
      gambitExtraActive: false,
      gambitExtraPerSlot: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const buff = result.state.berserkTurnBuff as any;
    expect(buff.equipmentSlot1 ?? 0).toBe(0);
    expect(buff.equipmentSlot2 ?? 0).toBe(0);
  });

  it('已经 HP=1 时不会再扣（hpLoss=0 早返）', () => {
    const card = bgCard(1);
    const state = makeState({
      handCards: [card],
      hp: 1,
      maxHp: 12,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(1);
    expect(result.state.gambitExtraActive).toBe(true);
    expect(result.state.gambitExtraPerSlot).toBe(3);
  });

  it('向后兼容：旧存档 upgradeLevel=2/3 一律按 L1 处理（extraPerSlot=3）', () => {
    // 旧存档可能存有 upgradeLevel=2 或 3 的孤注一掷卡。
    // 修改后 maxUpgradeLevel=1，但运行时 resolver 必须不抛错且映射成 L1。
    for (const lvl of [2, 3, 5, 99]) {
      const card = { ...bgCard(lvl), id: `bg-legacy-${lvl}` } as any;
      const state = makeState({
        handCards: [card],
        hp: 10,
        maxHp: 12,
        phase: 'playerInput',
      });
      const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
      expect(result.state.hp, `lvl=${lvl}`).toBe(1);
      expect(result.state.gambitExtraPerSlot, `lvl=${lvl}`).toBe(3);
    }
  });

  it('maxUpgradeLevel=1：L1 → L2 不再生效', () => {
    const card = { ...bgCard(1), id: 'bg-cap' } as any;
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
  });
});

// ===========================================================================
// Static validation: knightDeck definitions
// ===========================================================================

describe('knightDeck definitions reflect upgrade paths', () => {
  it('亡者之契 has maxUpgradeLevel: 1 and knightEffect: monster-recruit', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('@/game-core/rng');
    const [deck] = generateKnightDeck(createRng(1));
    const card = deck.find(c => c.name === '亡者之契');
    expect(card).toBeDefined();
    expect((card as any).knightEffect).toBe('monster-recruit');
    expect((card as any).maxUpgradeLevel).toBe(1);
  });

  it('孤注一掷 has maxUpgradeLevel: 1 and knightEffect: berserk-gambit', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('@/game-core/rng');
    const [deck] = generateKnightDeck(createRng(1));
    const card = deck.find(c => c.name === '孤注一掷');
    expect(card).toBeDefined();
    expect((card as any).knightEffect).toBe('berserk-gambit');
    expect((card as any).maxUpgradeLevel).toBe(1);
  });
});
