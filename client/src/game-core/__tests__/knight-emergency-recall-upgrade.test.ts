/**
 * 紧急回收 (knight:recall-equipment, classCard) — upgrade behavior.
 *
 * L0: hpCost 2, draws 1 from backpack（既有 baseline，与
 *     `recall-equipment-class-gated-draw.test.ts` 重合，这里只兜底 1 个 case）.
 * L1: hpCost 1, draws 2 from backpack.
 * L2: 同 L1，且卡自身被打上 `topOnRecycleRestore: true` flag。
 *     play 后卡进 `permanentMagicRecycleBag`，flag 跟着卡走；下一次瀑流
 *     `processRecycleBag` 会确定性把它放到 `backpackItems[0]`。
 *
 * 这条规则同时验证了：
 *   1. handler（升级写 state.handCards 中卡对象）
 *   2. formatter（描述文案跟着 upgradeLevel 走）
 *   3. resolver（hpCost / drawCount 跟着 upgradeLevel 走，两条 callsite：
 *      single-option auto-pick 与 modal RESOLVE_MAGIC_CHOICE 两路径）
 *   4. 置顶 flag 端到端跟着卡传到回收袋
 *
 * 真实游戏链：UPGRADE_CARD → PLAY_CARD → (auto-resolve | RESOLVE_MAGIC_CHOICE) → drain。
 * Fixture 用 `phase: 'playerInput'`，参考 `pipeline-input-continuation.mdc`。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { EquipmentItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeShield(id: string): EquipmentItem {
  return {
    id,
    type: 'shield',
    name: 'Iron Shield',
    value: 2,
    armorMax: 2,
    durability: 2,
    maxDurability: 2,
  } as EquipmentItem;
}

function makeKnightRecallCard(upgradeLevel = 0): GameCardData {
  return {
    id: 'knight-emergency-recall-test',
    type: 'magic',
    name: '紧急回收',
    value: 0,
    image: '',
    classCard: true,
    unique: true,
    magicType: 'permanent',
    magicEffect: '失去 2 HP，回手一张牌，抽 1 张牌。',
    description: '永久：失去 2 点生命，回手一张牌，抽 1 张牌。',
    shortDescription: '失去 2 生命，回手 1 张，抽 1 张',
    knightEffect: 'recall-equipment',
    maxUpgradeLevel: 2,
    upgradeLevel,
  } as GameCardData;
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Filler ${id}`,
    value: 0,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// UPGRADE handler: handler stamps fields directly (formatter handles text)
// ---------------------------------------------------------------------------

describe('紧急回收 UPGRADE_CARD — handler effects', () => {
  it('L0 → L1: formatter rewrites text to "失去 1 HP / 抽 2 张"; topOnRecycleRestore NOT set', () => {
    const card = makeKnightRecallCard(0);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;

    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('失去 1 点生命');
    expect(upgraded.description).toContain('抽 2 张');
    expect(upgraded.shortDescription).toContain('失去 1');
    expect(upgraded.shortDescription).toContain('抽 2');
    expect(upgraded.magicEffect).toContain('失去 1 HP');
    expect(upgraded.magicEffect).toContain('抽 2 张');
    expect(upgraded.topOnRecycleRestore).not.toBe(true);
  });

  it('L1 → L2: text stays the same; topOnRecycleRestore stamped on card', () => {
    const card = makeKnightRecallCard(1);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;

    expect(upgraded.upgradeLevel).toBe(2);
    // 数值文案不变（仍 1 HP / 2 张）
    expect(upgraded.description).toContain('失去 1 点生命');
    expect(upgraded.description).toContain('抽 2 张');
    // 关键：置顶 flag 被盖戳
    expect(upgraded.topOnRecycleRestore).toBe(true);
  });

  it('L0 → L2（直接升两级）：累计 L0→L1→L2 后置顶 flag 在', () => {
    let state = makeState({ handCards: [makeKnightRecallCard(0)] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: 'knight-emergency-recall-test' }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: 'knight-emergency-recall-test' }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.topOnRecycleRestore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PLAY at each level — hpCost / drawCount via single-option auto-resolve
// ---------------------------------------------------------------------------

describe('紧急回收 PLAY_CARD — hpCost & drawCount per upgradeLevel (single-option fast path)', () => {
  it('L0: hp -2, recalls shield, draws 1 from backpack', () => {
    const card = makeKnightRecallCard(0);
    const state = makeState({
      handCards: [card],
      hp: 20,
      equipmentSlot1: makeShield('s1'),
      equipmentSlot2: null,
      amuletSlots: [],
      backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2'), makeBackpackCard('bp3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.hp).toBe(18);
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.handCards.find(c => c.id === 's1')).toBeDefined();
    // recalled shield + 1 backpack draw = 2 hand cards
    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(2);

    const banner = result.sideEffects.find(
      s => s.event === 'ui:banner' && typeof (s.payload as any)?.text === 'string',
    );
    expect((banner?.payload as any)?.text).toMatch(/失去 2 HP/);
    expect((banner?.payload as any)?.text).toMatch(/抽 1 张牌/);
  });

  it('L1: hp -1, recalls shield, draws 2 from backpack', () => {
    const card = makeKnightRecallCard(1);
    const state = makeState({
      handCards: [card],
      hp: 20,
      equipmentSlot1: makeShield('s1'),
      equipmentSlot2: null,
      amuletSlots: [],
      backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2'), makeBackpackCard('bp3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.hp).toBe(19);
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.handCards.find(c => c.id === 's1')).toBeDefined();
    // recalled shield + 2 backpack draws = 3 hand cards
    expect(result.state.handCards.length).toBe(3);
    expect(result.state.backpackItems.length).toBe(1);

    const banner = result.sideEffects.find(
      s => s.event === 'ui:banner' && typeof (s.payload as any)?.text === 'string',
    );
    expect((banner?.payload as any)?.text).toMatch(/失去 1 HP/);
    expect((banner?.payload as any)?.text).toMatch(/抽 2 张牌/);
  });

  it('L2: hp -1, draws 2, AND card itself lands in recycle bag with topOnRecycleRestore: true', () => {
    const card = makeKnightRecallCard(2);
    // 显式 stamp 置顶 flag（在实战中由 UPGRADE_CARD handler 写；这里跳过升级，
    // 直接 stamp 来隔离 PLAY 路径的行为）。
    (card as any).topOnRecycleRestore = true;

    const state = makeState({
      handCards: [card],
      hp: 20,
      equipmentSlot1: makeShield('s1'),
      equipmentSlot2: null,
      amuletSlots: [],
      backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2'), makeBackpackCard('bp3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.hp).toBe(19);
    expect(result.state.equipmentSlot1).toBeNull();
    // recalled shield + 2 backpack draws = 3 hand cards
    expect(result.state.handCards.length).toBe(3);
    expect(result.state.backpackItems.length).toBe(1);

    // 关键：紧急回收 本身进 permanentMagicRecycleBag，且 topOnRecycleRestore 仍在卡上
    const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === card.id) as any;
    expect(inBag).toBeDefined();
    expect(inBag.topOnRecycleRestore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PLAY at each level — modal RESOLVE_MAGIC_CHOICE path (2+ options)
// ---------------------------------------------------------------------------

describe('紧急回收 PLAY_CARD — hpCost & drawCount per upgradeLevel (modal path)', () => {
  it('L1: 双装备槽 modal 选 slot1 — hp -1, recall slot1, draws 2', () => {
    const card = makeKnightRecallCard(1);
    const state = makeState({
      handCards: [card],
      hp: 20,
      equipmentSlot1: makeShield('s1'),
      equipmentSlot2: makeShield('s2'),
      amuletSlots: [],
      backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2'), makeBackpackCard('bp3')],
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('recall-equipment');
    expect((afterPlay.state.pendingMagicAction as any)?.data?.hpCost).toBe(1);
    expect((afterPlay.state.pendingMagicAction as any)?.data?.drawCount).toBe(2);
    // HP 已经在 PLAY 阶段扣
    expect(afterPlay.state.hp).toBe(19);

    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_CHOICE', choiceId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot2).not.toBeNull(); // 另一栏不动
    // recalled shield + 2 backpack draws = 3 hand cards
    expect(result.state.handCards.length).toBe(3);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('L2: 双装备槽 modal 选 slot2 — hp -1, draws 2, 紧急回收 入袋后带 置顶 flag', () => {
    const card = makeKnightRecallCard(2);
    (card as any).topOnRecycleRestore = true;
    const state = makeState({
      handCards: [card],
      hp: 20,
      equipmentSlot1: makeShield('s1'),
      equipmentSlot2: makeShield('s2'),
      amuletSlots: [],
      backpackItems: [makeBackpackCard('bp1'), makeBackpackCard('bp2'), makeBackpackCard('bp3')],
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('recall-equipment');

    const result = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_CHOICE', choiceId: 'equipmentSlot2' } as GameAction,
    ]);

    expect(result.state.hp).toBe(19);
    expect(result.state.equipmentSlot2).toBeNull();
    expect(result.state.equipmentSlot1).not.toBeNull();
    expect(result.state.handCards.length).toBe(3); // recall s2 + 2 draws
    expect(result.state.backpackItems.length).toBe(1);

    const inBag = result.state.permanentMagicRecycleBag.find(c => c.id === card.id) as any;
    expect(inBag).toBeDefined();
    expect(inBag.topOnRecycleRestore).toBe(true);
  });
});
