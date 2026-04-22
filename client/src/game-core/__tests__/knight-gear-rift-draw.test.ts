/**
 * 修裂启示 (knight:gear-rift-draw) tests
 *
 * 卡面：永久（Perm 1）。选择一件装备，每有 1 点缺失耐久（耐久上限 - 当前耐久）
 * 从背包抽 2 张牌。
 *
 * 公式：drawCount = max(0, maxDurability - durability) * 2 * echoMultiplier
 *
 * 边界：
 *   - 空槽 / 没耐久概念的装备 → 拒绝，magic NOT consumed（pendingMagicAction 仍清）
 *   - 装备满耐久（缺 0）→ magic consumed，0 抽，banner 提示「耐久未损」
 *   - 抽牌受手牌上限约束（drawFromBackpackToHandPure 自然停止）
 *   - Echo (A 类)：最终抽牌数 ×echoMultiplier
 *   - 不设升级
 *
 * 覆盖：
 *   1. PLAY_CARD 打开 slot-select pendingMagicAction
 *   2. 缺 2 耐久 → 抽 4 张
 *   3. 缺 1 耐久 → 抽 2 张
 *   4. 满耐久（缺 0）→ 0 抽，magic 仍消耗
 *   5. 空槽 → 拒绝，magic 未消耗
 *   6. 怪物装备同样适用（任何带 maxDurability 的装备）
 *   7. Echo ×2：抽牌数 ×2
 *   8. 背包不够：自然停止
 *   9. 手牌上限约束
 *   10. 只读所选栏（不影响装备本身）
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { HAND_LIMIT } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'grd'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '修裂启示',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：选择一件装备，按缺失耐久 ×2 抽牌。',
    knightEffect: 'gear-rift-draw',
    description: 'test',
    recycleDelay: 1,
  } as any;
}

function makeWeapon(opts: { id?: string; maxDur: number; dur: number; name?: string } ): GameCardData {
  return {
    id: opts.id ?? 'eq-w',
    type: 'weapon',
    name: opts.name ?? '测试武器',
    value: 3,
    image: '',
    durability: opts.dur,
    maxDurability: opts.maxDur,
  } as any;
}

function makeMonsterEquip(opts: { id?: string; maxDur: number; dur: number }): GameCardData {
  return {
    id: opts.id ?? 'eq-m',
    type: 'monster',
    name: '怪物装备',
    value: 2,
    image: '',
    durability: opts.dur,
    maxDurability: opts.maxDur,
    monsterType: 'standard',
  } as any;
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `BP-${id}`,
    value: 0,
    image: '',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 入口：PLAY_CARD → slot-select
// ---------------------------------------------------------------------------

describe('修裂启示 — 入口', () => {
  it('PLAY_CARD 打开 slot-select pendingMagicAction', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('gear-rift-draw');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });
});

// ---------------------------------------------------------------------------
// 主公式：missing × 2
// ---------------------------------------------------------------------------

describe('修裂启示 — 主公式 (missing × 2)', () => {
  it('缺 2 耐久（dur 1, max 3）→ 抽 4 张', () => {
    const card = makeCard('m2');
    const weapon = makeWeapon({ maxDur: 3, dur: 1 });
    const bps = Array.from({ length: 6 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(4);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('缺 1 耐久（dur 2, max 3）→ 抽 2 张', () => {
    const card = makeCard('m1');
    const weapon = makeWeapon({ maxDur: 3, dur: 2 });
    const bps = Array.from({ length: 4 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(2);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(2);
  });

  it('缺 4 耐久（dur 0, max 4）→ 想抽 8 张，受手牌上限约束（drawFromBackpackToHandPure 自然停止）', () => {
    const card = makeCard('m4');
    const weapon = makeWeapon({ maxDur: 4, dur: 0 });
    const bps = Array.from({ length: 12 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // 抽牌时 magic 卡仍占手牌槽，HAND_LIMIT=6 → 最多再补 5 张到 6
    // FINALIZE_MAGIC_CARD 之后 magic 入回收袋，最终手牌 = 5 张 bp。
    expect(result.state.handCards.length).toBeLessThanOrEqual(HAND_LIMIT);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(HAND_LIMIT - 1);
  });
});

// ---------------------------------------------------------------------------
// 边界：满耐久 / 空槽 / 怪物装备
// ---------------------------------------------------------------------------

describe('修裂启示 — 边界条件', () => {
  it('满耐久（缺 0）：magic 仍消耗，0 抽', () => {
    const card = makeCard('full');
    const weapon = makeWeapon({ maxDur: 3, dur: 3 });
    const bps = [makeBackpackCard('bp-keep')];
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // 0 抽，背包不变
    expect(result.state.backpackItems.length).toBe(1);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(0);
    // 但 magic 已消耗（pendingMagicAction 清）
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('空槽：拒绝，magic 未消耗（pendingMagicAction 清但仍可重选 → 这里只验证抽牌为 0）', () => {
    const card = makeCard('empty');
    const bps = [makeBackpackCard('bp-keep')];
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: null,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // 0 抽
    expect(result.state.backpackItems.length).toBe(1);
    // banner 提示「该装备栏为空。」
    expect(result.state.heroSkillBanner).toContain('该装备栏为空');
  });

  it('怪物装备同样适用：缺 1 耐久 → 抽 2 张', () => {
    const card = makeCard('mon');
    const eq = makeMonsterEquip({ maxDur: 2, dur: 1 });
    const bps = Array.from({ length: 4 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot2: eq as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(2);
  });

  it('只读所选栏（不影响装备本身的耐久 / 上限）', () => {
    const card = makeCard('readonly');
    const weapon = makeWeapon({ id: 'w-ro', maxDur: 4, dur: 1 });
    const bps = Array.from({ length: 6 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect((result.state.equipmentSlot1 as any).durability).toBe(1);
    expect((result.state.equipmentSlot1 as any).maxDurability).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Echo
// ---------------------------------------------------------------------------

describe('修裂启示 — 法术回响', () => {
  it('Echo ×2：缺 1 耐久 → base 2 → 4 张', () => {
    const card = makeCard('echo');
    const weapon = makeWeapon({ maxDur: 3, dur: 2 });
    const bps = Array.from({ length: 6 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: {
        card,
        effect: 'gear-rift-draw',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(4);
  });

  it('Echo ×2 + 满耐久：base 0 ×2 = 0', () => {
    const card = makeCard('echo-zero');
    const weapon = makeWeapon({ maxDur: 3, dur: 3 });
    const bps = [makeBackpackCard('bp-keep')];
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: {
        card,
        effect: 'gear-rift-draw',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('PLAY_CARD with doubleNextMagic：echoMultiplier 透传到 pending；之后 slot-select 抽牌 ×2', () => {
    const card = makeCard('play-echo');
    const weapon = makeWeapon({ maxDur: 3, dur: 1 });
    const bps = Array.from({ length: 10 }, (_, i) => makeBackpackCard(`bp-${i}`));
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      doubleNextMagic: true,
    });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((r1.state.pendingMagicAction as any).echoMultiplier).toBe(2);
    const r2 = drain(r1.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // 缺 2 × 2 × echo 2 = 8；PLAY_CARD 路径下 magic 在抽牌前已离手，
    // HAND_LIMIT=6 → 抽满 6 张后停止
    expect(r2.state.handCards.length).toBeLessThanOrEqual(HAND_LIMIT);
    expect(r2.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(HAND_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// 背包不够
// ---------------------------------------------------------------------------

describe('修裂启示 — 背包不够', () => {
  it('缺 3 耐久（想抽 6 张）但背包只有 2 张 → 抽 2 张然后停止，magic 仍结算', () => {
    const card = makeCard('dry');
    const weapon = makeWeapon({ maxDur: 4, dur: 1 });
    const bps = [makeBackpackCard('bp-x'), makeBackpackCard('bp-y')];
    const state = makeState({
      handCards: [card],
      backpackItems: bps as any,
      equipmentSlot1: weapon as any,
      pendingMagicAction: { card, effect: 'gear-rift-draw', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'gear-rift-draw', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.backpackItems.length).toBe(0);
    expect(result.state.handCards.filter(c => c.id.startsWith('bp-')).length).toBe(2);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});
