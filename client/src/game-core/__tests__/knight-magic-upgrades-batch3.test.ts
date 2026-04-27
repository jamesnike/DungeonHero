/**
 * Knight 专属 Magic 升级 — 第 3 批 5 张卡 × 多 consumer 路径覆盖
 *
 * 验证矩阵（per `shared-effect-id-impact-check.mdc`：每张卡的所有 consumer 路径都要测）：
 *
 *   永恒之器 (eternal-vessel):
 *     - 路径 A (handler，仅描述): upgrades.ts eternalVessel
 *     - 路径 B (resolver): magic-effects.ts case 'eternal-vessel' (hpBoosts table)
 *     - HP 损失（cost）固定 3，仅 maxHp 加成随升级浮动
 *
 *   血誓回卷 (flip-back-active):
 *     - 路径 A (handler，仅描述): upgrades.ts flipBackActive
 *     - 路径 B (on-enter-hand): on-enter-hand.ts bloodOathScrollOnHand (healAmounts table)
 *     - 主效果（失去 3 HP + 翻回一张已翻转卡）不随升级浮动
 *
 *   三牌惊雷 (three-card-thunder):
 *     - 路径 A (handler，仅描述): upgrades.ts threeCardThunder
 *     - 路径 B (on-enter-hand): on-enter-hand.ts threeCardThunderOnHand (onHandDamages table)
 *     - 主效果（背包恰 3 张时全场 9 法伤）不随升级浮动
 *
 *   整顿背囊 (reorganize-backpack):
 *     - 路径 A (handler，仅描述): upgrades.ts reorganizeBackpack
 *     - 路径 B (resolver): magic-effects.ts case 'reorganize-backpack' (capacityBonuses table)
 *     - MAX_PICK_REQUESTED 始终基于 3，不随升级浮动
 *
 *   盾影双噬 (armor-double-strike):
 *     - 路径 A (handler，仅描述): upgrades.ts armorDoubleStrike
 *     - 路径 B (slot-select prompt): magic-effects.ts resolveKnightPermanentMagic (armor-double-strike)
 *     - 路径 C (executeArmorDoubleStrike): armorPcts + targetCounts 表
 *
 * 参数 表：
 *   - eternal-vessel:        L0 = +3, L1 = +4, L2 = +5    (maxUpgradeLevel = 2)
 *   - flip-back-active:      L0 = +1, L1 = +2, L2 = +3 HP (maxUpgradeLevel = 2)
 *   - three-card-thunder:    L0 =  1, L1 =  2, L2 =  3    (maxUpgradeLevel = 2)
 *   - reorganize-backpack:   L0 = +1, L1 = +2 capacity    (maxUpgradeLevel = 1)
 *   - armor-double-strike:   L0 = 50%/2, L1 = 75%/2, L2 = 75%/3 (maxUpgradeLevel = 2)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resolveUpgradeEffectId } from '../card-schema';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...(overrides ?? {}) };
}

function makeMonster(id: string, hp: number) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function makeShield(overrides: Record<string, unknown> = {}): EquipmentItem {
  return {
    id: 's1',
    type: 'shield' as const,
    name: 'Test Shield',
    value: 4,
    armorMax: 4,
    durability: 3,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

// ===========================================================================
// 永恒之器 (eternal-vessel)
// ===========================================================================

describe('永恒之器 (eternal-vessel) — routing', () => {
  it('routes to knight:eternal-vessel via knightEffect field', () => {
    const card: GameCardData = {
      id: 'ev-route',
      type: 'magic',
      name: '永恒之器',
      value: 0,
      knightEffect: 'eternal-vessel',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:eternal-vessel');
  });
});

describe('永恒之器 (eternal-vessel) — handler description updates', () => {
  function evL0(): GameCardData {
    return {
      id: 'ev-handler',
      type: 'magic',
      name: '永恒之器',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：失去 3 生命，生命上限永久 +3。',
      shortDescription: '失去 3 生命，生命上限永久 +3',
      magicEffect: '永久魔法：失去 3 生命，生命上限永久 +3。',
      knightEffect: 'eternal-vessel',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: description / shortDescription / magicEffect 全部 +3 → +4', () => {
    const card = evL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('生命上限永久 +4');
    expect(upgraded.description).not.toContain('生命上限永久 +3');
    expect(upgraded.shortDescription).toContain('生命上限永久 +4');
    expect(upgraded.magicEffect).toContain('生命上限永久 +4');
  });

  it('L1 → L2: description / shortDescription / magicEffect 全部 +4 → +5', () => {
    const card = { ...evL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('生命上限永久 +5');
    expect(upgraded.shortDescription).toContain('生命上限永久 +5');
    expect(upgraded.magicEffect).toContain('生命上限永久 +5');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...evL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('永恒之器 (eternal-vessel) — resolver maxHp boost', () => {
  function makeEvCard(level?: number): GameCardData {
    return {
      id: `ev-l${level ?? 0}`,
      type: 'magic',
      name: '永恒之器',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'eternal-vessel',
      recycleDelay: 2,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  it('L0: hp -3, permanentMaxHpBonus +3', () => {
    const card = makeEvCard(0);
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

  it('L1: hp -3, permanentMaxHpBonus +4 (HP cost stays at 3)', () => {
    const card = makeEvCard(1);
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(27);
    expect(result.state.permanentMaxHpBonus).toBe(4);
  });

  it('L2: hp -3, permanentMaxHpBonus +5 (HP cost stays at 3)', () => {
    const card = makeEvCard(2);
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(27);
    expect(result.state.permanentMaxHpBonus).toBe(5);
  });

  it('L2 + Echo ×2: hp -6, permanentMaxHpBonus +10 (boost ×2)', () => {
    const card = makeEvCard(2);
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMaxHpBonus: 0,
      doubleNextMagic: true,
      phase: 'playerInput',
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.hp).toBe(24);
    expect(result.state.permanentMaxHpBonus).toBe(10);
    expect(result.state.doubleNextMagic).toBe(false);
  });
});

// ===========================================================================
// 血誓回卷 (flip-back-active)
// ===========================================================================

describe('血誓回卷 (flip-back-active) — routing', () => {
  it('routes to knight:flip-back-active via knightEffect field', () => {
    const card: GameCardData = {
      id: 'fba-route',
      type: 'magic',
      name: '血誓回卷',
      value: 0,
      knightEffect: 'flip-back-active',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:flip-back-active');
  });
});

describe('血誓回卷 (flip-back-active) — handler description updates', () => {
  function fbaL0(): GameCardData {
    return {
      id: 'fba-handler',
      type: 'magic',
      name: '血誓回卷',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：失去 3 生命，选择当前行一张「已翻转」卡牌，将其翻回原始形态。\n上手：恢复 1 生命。',
      shortDescription: '失去 3 生命，翻回 1 张已翻转卡；上手 +1 生命',
      magicEffect: '将一张已翻转的牌翻回去；上手 +1 生命。',
      knightEffect: 'flip-back-active',
      onEnterHandEffect: 'blood-oath-scroll-onhand',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 上手 heal +1 → +2（主效果不变）', () => {
    const card = fbaL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('恢复 2 生命');
    expect(upgraded.description).not.toContain('恢复 1 生命');
    // 主效果不变
    expect(upgraded.description).toContain('失去 3 生命');
    expect(upgraded.description).toContain('已翻转');
    expect(upgraded.shortDescription).toContain('上手 +2 生命');
    expect(upgraded.magicEffect).toContain('上手 +2 生命');
  });

  it('L1 → L2: 上手 heal +2 → +3', () => {
    const card = { ...fbaL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('恢复 3 生命');
    expect(upgraded.shortDescription).toContain('上手 +3 生命');
    expect(upgraded.magicEffect).toContain('上手 +3 生命');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...fbaL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('血誓回卷 (flip-back-active) — on-enter-hand heal scales with upgrade', () => {
  function makeFbaCard(level?: number): GameCardData {
    return {
      id: `fba-onhand-l${level ?? 0}`,
      type: 'magic',
      name: '血誓回卷',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'flip-back-active',
      onEnterHandEffect: 'blood-oath-scroll-onhand',
      recycleDelay: 2,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  it('L0: heals 1 HP', () => {
    const card = makeFbaCard(0);
    const state = makeState({ handCards: [card], hp: 5 });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.hp).toBe(6);
  });

  it('L1: heals 2 HP', () => {
    const card = makeFbaCard(1);
    const state = makeState({ handCards: [card], hp: 5 });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.hp).toBe(7);
  });

  it('L2: heals 3 HP', () => {
    const card = makeFbaCard(2);
    const state = makeState({ handCards: [card], hp: 5 });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.hp).toBe(8);
  });

  it('L2 fires automatically when ADD_CARD_TO_HAND adds the card (pipeline)', () => {
    const card = makeFbaCard(2);
    const state = makeState({ handCards: [], hp: 5 });
    const result = drain(state, [{ type: 'ADD_CARD_TO_HAND', card } as GameAction]);
    expect(result.state.handCards.some(c => c.id === card.id)).toBe(true);
    expect(result.state.hp).toBe(8);
  });
});

// ===========================================================================
// 三牌惊雷 (three-card-thunder)
// ===========================================================================

describe('三牌惊雷 (three-card-thunder) — routing', () => {
  it('routes to knight:three-card-thunder via knightEffect field', () => {
    const card: GameCardData = {
      id: 'tct-route',
      type: 'magic',
      name: '三牌惊雷',
      value: 0,
      knightEffect: 'three-card-thunder',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:three-card-thunder');
  });
});

describe('三牌惊雷 (three-card-thunder) — handler description updates', () => {
  function tctL0(): GameCardData {
    return {
      id: 'tct-handler',
      type: 'magic',
      name: '三牌惊雷',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：若背包正好有 3 张牌，对所有怪物造成 9 点法术伤害。\n上手：对所有怪物各造成 1 点法术伤害。',
      shortDescription: '背包恰 3 张时全场 9 法伤；上手全场 1 法伤',
      magicEffect: '背包恰好 3 张时全场 9 点法伤；上手全场 1 点法伤。',
      knightEffect: 'three-card-thunder',
      onEnterHandEffect: 'three-card-thunder-onhand',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 上手 dmg 1 → 2（主效果不变）', () => {
    const card = tctL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('上手：对所有怪物各造成 2 点法术伤害');
    // 主效果保持
    expect(upgraded.description).toContain('背包正好有 3 张牌');
    expect(upgraded.description).toContain('9 点法术伤害');
    expect(upgraded.shortDescription).toContain('上手全场 2 法伤');
    expect(upgraded.magicEffect).toContain('上手全场 2 点法伤');
  });

  it('L1 → L2: 上手 dmg 2 → 3', () => {
    const card = { ...tctL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('上手：对所有怪物各造成 3 点法术伤害');
    expect(upgraded.shortDescription).toContain('上手全场 3 法伤');
    expect(upgraded.magicEffect).toContain('上手全场 3 点法伤');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...tctL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('三牌惊雷 (three-card-thunder) — on-enter-hand damage scales with upgrade', () => {
  function makeTctCard(level?: number): GameCardData {
    return {
      id: `tct-onhand-l${level ?? 0}`,
      type: 'magic',
      name: '三牌惊雷',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'three-card-thunder',
      onEnterHandEffect: 'three-card-thunder-onhand',
      recycleDelay: 2,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  it('L0: 1 spell damage per monster', () => {
    const card = makeTctCard(0);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 10), makeMonster('m2', 10)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    expect(monsters.find(m => m.id === 'm1')?.hp).toBe(9);
    expect(monsters.find(m => m.id === 'm2')?.hp).toBe(9);
  });

  it('L1: 2 spell damage per monster', () => {
    const card = makeTctCard(1);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 10), makeMonster('m2', 10)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    expect(monsters.find(m => m.id === 'm1')?.hp).toBe(8);
    expect(monsters.find(m => m.id === 'm2')?.hp).toBe(8);
  });

  it('L2: 3 spell damage per monster', () => {
    const card = makeTctCard(2);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 10), makeMonster('m2', 10)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    expect(monsters.find(m => m.id === 'm1')?.hp).toBe(7);
    expect(monsters.find(m => m.id === 'm2')?.hp).toBe(7);
  });

  it('L2 + permanentSpellDamageBonus: 3 + bonus per monster', () => {
    const card = makeTctCard(2);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 10)),
      permanentSpellDamageBonus: 2,
    });
    const result = drain(state, [
      { type: 'TRIGGER_ON_ENTER_HAND', cardId: card.id } as GameAction,
    ]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(5);
  });
});

// ===========================================================================
// 整顿背囊 (reorganize-backpack)
// ===========================================================================

describe('整顿背囊 (reorganize-backpack) — routing', () => {
  it('routes to knight:reorganize-backpack via knightEffect field', () => {
    const card: GameCardData = {
      id: 'rb-route',
      type: 'magic',
      name: '整顿背囊',
      value: 0,
      knightEffect: 'reorganize-backpack',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:reorganize-backpack');
  });
});

describe('整顿背囊 (reorganize-backpack) — handler description updates', () => {
  function rbL0(): GameCardData {
    return {
      id: 'rb-handler',
      type: 'magic',
      name: '整顿背囊',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：背包上限 +1，然后从手牌、护符栏或装备栏中选择至多 3 张牌放回背包顶部。装备/护符不会触发任何破损或转化效果。',
      shortDescription: '背包+1；至多 3 张牌放回背包顶部',
      magicEffect: '背包上限 +1；选至多 3 张牌放回背包顶部。',
      knightEffect: 'reorganize-backpack',
      recycleDelay: 2,
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 背包上限 +1 → +2', () => {
    const card = rbL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('背包上限 +2');
    expect(upgraded.description).not.toContain('背包上限 +1');
    expect(upgraded.shortDescription).toContain('背包+2');
    expect(upgraded.magicEffect).toContain('背包上限 +2');
  });

  it('cannot upgrade past maxUpgradeLevel (1)', () => {
    const card = { ...rbL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
  });
});

describe('整顿背囊 (reorganize-backpack) — resolver capacity bonus scales', () => {
  function makeRbCard(level?: number): GameCardData {
    return {
      id: `rb-resolver-l${level ?? 0}`,
      type: 'magic',
      name: '整顿背囊',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'reorganize-backpack',
      recycleDelay: 2,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  function makeFiller(id: string) {
    return { id, type: 'magic' as const, name: 'Filler', value: 0, image: '' };
  }

  it('L0: backpackCapacityModifier += 1', () => {
    const card = makeRbCard(0);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp1')] as any,
      backpackCapacityModifier: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.backpackCapacityModifier).toBe(1);
  });

  it('L1: backpackCapacityModifier += 2', () => {
    const card = makeRbCard(1);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp1')] as any,
      backpackCapacityModifier: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.backpackCapacityModifier).toBe(2);
  });

  it('L1: still opens multi-select prompt (selection cap stays based on 3)', () => {
    const card = makeRbCard(1);
    const state = makeState({
      handCards: [card, makeFiller('h1'), makeFiller('h2')] as any,
      backpackItems: [makeFiller('bp1')] as any,
      backpackCapacityModifier: 0,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    const pending = result.state.pendingMagicAction as any;
    expect(pending.effect).toBe('reorganize-backpack');
    expect(pending.step).toBe('multi-select');
    expect(pending.maxSelections).toBe(3);
  });

  it('L1 + Echo ×2: capacity +4 (base 2 × echo 2)', () => {
    const card = makeRbCard(1);
    const state = makeState({
      handCards: [card],
      backpackItems: [makeFiller('bp1')] as any,
      backpackCapacityModifier: 0,
      doubleNextMagic: true,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.backpackCapacityModifier).toBe(4);
  });
});

// ===========================================================================
// 盾影双噬 (armor-double-strike)
// ===========================================================================

describe('盾影双噬 (armor-double-strike) — routing', () => {
  it('routes to knight:armor-double-strike via knightEffect field', () => {
    const card: GameCardData = {
      id: 'ads-route',
      type: 'magic',
      name: '盾影双噬',
      value: 0,
      knightEffect: 'armor-double-strike',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:armor-double-strike');
  });
});

describe('盾影双噬 (armor-double-strike) — handler description updates', () => {
  function adsL0(): GameCardData {
    return {
      id: 'ads-handler',
      type: 'magic',
      name: '盾影双噬',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：选择一面护盾，对随机 2 个怪物各造成 50% 护甲值的法术伤害，然后该护盾耐久 -1。',
      shortDescription: '50% 护甲法伤随机 2 怪；该盾耐久 -1',
      magicEffect: '护甲值 50% 伤害随机两怪，盾耐久 -1。',
      knightEffect: 'armor-double-strike',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 50% → 75%（目标数仍 2）', () => {
    const card = adsL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('随机 2 个怪物');
    expect(upgraded.description).toContain('75%');
    expect(upgraded.description).not.toContain('50%');
    expect(upgraded.shortDescription).toContain('75%');
    expect(upgraded.shortDescription).toContain('随机 2 怪');
    expect(upgraded.magicEffect).toContain('75%');
    expect(upgraded.magicEffect).toContain('随机 2 怪');
  });

  it('L1 → L2: 仍 75%，目标数 2 → 3', () => {
    const card = { ...adsL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('随机 3 个怪物');
    expect(upgraded.description).toContain('75%');
    expect(upgraded.shortDescription).toContain('随机 3 怪');
    expect(upgraded.shortDescription).toContain('75%');
    expect(upgraded.magicEffect).toContain('随机 3 怪');
    expect(upgraded.magicEffect).toContain('75%');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...adsL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('盾影双噬 (armor-double-strike) — slot-select prompt scales with upgrade', () => {
  function makeAdsCard(level: number): GameCardData {
    return {
      id: `ads-prompt-l${level}`,
      type: 'magic',
      name: '盾影双噬',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-double-strike',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0 prompt: 50% / 2 个怪物', () => {
    const card = makeAdsCard(0);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1' }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending).not.toBeNull();
    expect(pending.prompt).toContain('随机 2 个怪物');
    expect(pending.prompt).toContain('50%');
  });

  it('L1 prompt: 75% / 2 个怪物', () => {
    const card = makeAdsCard(1);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1' }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending.prompt).toContain('随机 2 个怪物');
    expect(pending.prompt).toContain('75%');
  });

  it('L2 prompt: 75% / 3 个怪物', () => {
    const card = makeAdsCard(2);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1' }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending.prompt).toContain('随机 3 个怪物');
    expect(pending.prompt).toContain('75%');
  });
});

describe('盾影双噬 (armor-double-strike) — executeArmorDoubleStrike damage path', () => {
  function makeAdsCard(level: number): GameCardData {
    return {
      id: `ads-exec-l${level}`,
      type: 'magic',
      name: '盾影双噬',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-double-strike',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0: armor 8 × 50% = 4 dmg, hits 2 of 3 monsters', () => {
    const card = makeAdsCard(0);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1', value: 8, armorMax: 8, durability: 3 }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(
        makeMonster('m1', 100),
        makeMonster('m2', 100),
        makeMonster('m3', 100),
      ),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    const hits = monsters.filter(m => m.hp === 96);
    const misses = monsters.filter(m => m.hp === 100);
    expect(hits.length).toBe(2);
    expect(misses.length).toBe(1);
  });

  it('L1: armor 8 × 75% = 6 dmg, hits 2 of 3 monsters', () => {
    const card = makeAdsCard(1);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1', value: 8, armorMax: 8, durability: 3 }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(
        makeMonster('m1', 100),
        makeMonster('m2', 100),
        makeMonster('m3', 100),
      ),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    const hits = monsters.filter(m => m.hp === 94);
    const misses = monsters.filter(m => m.hp === 100);
    expect(hits.length).toBe(2);
    expect(misses.length).toBe(1);
  });

  it('L2: armor 8 × 75% = 6 dmg, hits 3 of 4 monsters', () => {
    const card = makeAdsCard(2);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1', value: 8, armorMax: 8, durability: 3 }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(
        makeMonster('m1', 100),
        makeMonster('m2', 100),
        makeMonster('m3', 100),
        makeMonster('m4', 100),
      ),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const monsters = result.state.activeCards.filter(c => c?.type === 'monster') as Array<{ id: string; hp: number }>;
    const hits = monsters.filter(m => m.hp === 94);
    const misses = monsters.filter(m => m.hp === 100);
    expect(hits.length).toBe(3);
    expect(misses.length).toBe(1);
  });

  it('L2: armor 8 × 75% = 6 dmg, hits all 2 monsters when only 2 exist (no doubling)', () => {
    const card = makeAdsCard(2);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeShield({ id: 's1', value: 8, armorMax: 8, durability: 3 }),
      equipmentSlot2: makeShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 100), makeMonster('m2', 100)),
      pendingMagicAction: {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-double-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m1 = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    const m2 = result.state.activeCards.find(c => c?.id === 'm2') as { hp: number } | undefined;
    expect(m1?.hp).toBe(94);
    expect(m2?.hp).toBe(94);
  });
});

// ===========================================================================
// 卡池静态校验：knightDeck 注册值与 handler 期望吻合
// ===========================================================================

describe('knight class deck — 第 3 批 5 张卡升级配置', () => {
  it('永恒之器 已声明 knightEffect: eternal-vessel + maxUpgradeLevel: 2', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const eternalVessel = deck.find(c => c.name === '永恒之器') as any;
    expect(eternalVessel).toBeDefined();
    expect(eternalVessel.knightEffect).toBe('eternal-vessel');
    expect(eternalVessel.maxUpgradeLevel).toBe(2);
  });

  it('血誓回卷 已声明 knightEffect: flip-back-active + maxUpgradeLevel: 2 + onEnterHandEffect', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const flipBack = deck.find(c => c.name === '血誓回卷') as any;
    expect(flipBack).toBeDefined();
    expect(flipBack.knightEffect).toBe('flip-back-active');
    expect(flipBack.maxUpgradeLevel).toBe(2);
    expect(flipBack.onEnterHandEffect).toBe('blood-oath-scroll-onhand');
  });

  it('三牌惊雷 已声明 knightEffect: three-card-thunder + maxUpgradeLevel: 2 + onEnterHandEffect', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const tct = deck.find(c => c.name === '三牌惊雷') as any;
    expect(tct).toBeDefined();
    expect(tct.knightEffect).toBe('three-card-thunder');
    expect(tct.maxUpgradeLevel).toBe(2);
    expect(tct.onEnterHandEffect).toBe('three-card-thunder-onhand');
  });

  it('整顿背囊 已声明 knightEffect: reorganize-backpack + maxUpgradeLevel: 1', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const rb = deck.find(c => c.name === '整顿背囊') as any;
    expect(rb).toBeDefined();
    expect(rb.knightEffect).toBe('reorganize-backpack');
    expect(rb.maxUpgradeLevel).toBe(1);
  });

  it('盾影双噬 已声明 knightEffect: armor-double-strike + maxUpgradeLevel: 2', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const ads = deck.find(c => c.name === '盾影双噬') as any;
    expect(ads).toBeDefined();
    expect(ads.knightEffect).toBe('armor-double-strike');
    expect(ads.maxUpgradeLevel).toBe(2);
  });
});
