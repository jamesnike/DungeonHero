/**
 * 淬铸迁位 (knight:amplify-equipment-shift) tests
 *
 * 卡面：永久（Perm 1）。选择一个装备栏的装备进行增幅一次（按卡名累计 +1）；
 *       若另一装备栏为空，将其换到空位。
 *
 * 设计要点：
 *   - 增幅按 NAME 全场累计（AMPLIFY_CARDS_BY_NAME）：影响手牌 / 背包 / 装备 /
 *     储备 / 坟场 / 回收袋 / 职业牌组 / 地下城行 中所有同名卡。
 *   - 只能选「有装备的栏」；空槽 → 拒绝（banner 提示，magic 未消耗，
 *     pendingMagicAction 仍保留供玩家重选）。
 *   - 移动语义：所选装备搬到「另一槽（空的那个）」→ 原槽走
 *     clearSlotAndPromoteReserve（reserve 顶上来或置 null）。新槽 fromSlot
 *     必须改为新槽 id（避免 GameBoard 拖放门读 stale fromSlot）。
 *   - Echo (A 类)：增幅 amount = 1 × echoMultiplier（多次累计）；「移到空位」
 *     最多发生 1 次（不在 echo 循环内重复）。
 *   - 不设升级。
 *
 * 覆盖：
 *   1. PLAY_CARD 打开 slot-select pendingMagicAction（透传 echoMultiplier）
 *   2. 主路径：选有装备的栏 → 全场同名 +1 + 搬到空槽
 *   3. 主路径：另一栏也有装备 → 只增幅，不移动
 *   4. 主路径：怪物装备同样适用
 *   5. 边界：空槽 → 拒绝（pendingMagicAction 保留 + 不消耗 magic）
 *   6. 边界：reserve 存在时移动 → reserve 自动 promote
 *   7. 边界：fromSlot 在新槽必须 = 新槽 id
 *   8. Echo：amplify ×N，move 仅 1 次
 *   9. 全场同名传染：手牌、背包、坟场都 +1
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    ...overrides,
  };
}

function makeCard(idSuffix = 'aes'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '淬铸迁位',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    magicEffect: '永久魔法：所选装备栏的装备 +1 增幅（按卡名累计），若另一栏为空则换到空位。',
    knightEffect: 'amplify-equipment-shift',
    description: 'test',
    recycleDelay: 1,
  } as any;
}

function makeWeapon(opts: { id?: string; name?: string; value?: number; maxDur?: number; dur?: number; fromSlot?: string }): GameCardData {
  return {
    id: opts.id ?? 'eq-w',
    type: 'weapon',
    name: opts.name ?? '汰换之刃',
    value: opts.value ?? 3,
    image: '',
    durability: opts.dur ?? 3,
    maxDurability: opts.maxDur ?? 3,
    fromSlot: opts.fromSlot,
  } as any;
}

function makeShield(opts: { id?: string; name?: string; value?: number; armorMax?: number; maxDur?: number; dur?: number; fromSlot?: string }): GameCardData {
  return {
    id: opts.id ?? 'eq-s',
    type: 'shield',
    name: opts.name ?? '盾',
    value: opts.value ?? 2,
    armorMax: opts.armorMax ?? 2,
    image: '',
    durability: opts.dur ?? 2,
    maxDurability: opts.maxDur ?? 2,
    fromSlot: opts.fromSlot,
  } as any;
}

function makeMonsterEquip(opts: { id?: string; name?: string; value?: number; maxDur?: number; dur?: number }): GameCardData {
  return {
    id: opts.id ?? 'eq-m',
    type: 'monster',
    name: opts.name ?? '怪物装备',
    value: opts.value ?? 2,
    image: '',
    durability: opts.dur ?? 1,
    maxDurability: opts.maxDur ?? 2,
    monsterType: 'standard',
  } as any;
}

// ---------------------------------------------------------------------------
// 入口：PLAY_CARD → slot-select
// ---------------------------------------------------------------------------

describe('淬铸迁位 — 入口', () => {
  it('PLAY_CARD 打开 slot-select pendingMagicAction', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('amplify-equipment-shift');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('PLAY_CARD with doubleNextMagic：echoMultiplier=2 透传到 pending', () => {
    const card = makeCard('echo-cast');
    const state = makeState({ handCards: [card], doubleNextMagic: true });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((result.state.pendingMagicAction as any).echoMultiplier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 主路径：增幅 + 移动
// ---------------------------------------------------------------------------

describe('淬铸迁位 — 主路径（增幅 + 移到空位）', () => {
  it('左槽有装备、右槽空：所选装备增幅 +1 并搬到右槽，左槽变空', () => {
    const card = makeCard('m1');
    const weapon = makeWeapon({ id: 'w-1', name: '汰换之刃', value: 3, fromSlot: 'equipmentSlot1' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon as any,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 增幅写入 amplifiedCardBonus map
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(1);

    // 装备从左槽搬到右槽
    expect(result.state.equipmentSlot1).toBeNull();
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-1');

    // 新槽位的 fromSlot 必须改成新槽 id（防 stale fromSlot）
    expect((result.state.equipmentSlot2 as any)?.fromSlot).toBe('equipmentSlot2');

    // 武器 amplifyBonus +1（applyAmplifyToCard 同步把数值加到 attack）
    expect((result.state.equipmentSlot2 as any)?.amplifyBonus).toBe(1);

    // magic 已消耗
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('右槽有装备、左槽空：所选装备搬到左槽', () => {
    const card = makeCard('m2');
    const weapon = makeWeapon({ id: 'w-2', fromSlot: 'equipmentSlot2' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: weapon as any,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.equipmentSlot2).toBeNull();
    expect((result.state.equipmentSlot1 as any)?.id).toBe('w-2');
    expect((result.state.equipmentSlot1 as any)?.fromSlot).toBe('equipmentSlot1');
  });

  it('双栏都有装备：只增幅所选栏，不移动', () => {
    const card = makeCard('m3');
    const w1 = makeWeapon({ id: 'w-A', name: '汰换之刃', value: 3, fromSlot: 'equipmentSlot1' });
    const w2 = makeWeapon({ id: 'w-B', name: '其它武器', value: 4, fromSlot: 'equipmentSlot2' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w1 as any,
      equipmentSlot2: w2 as any,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(1);
    expect(result.state.amplifiedCardBonus['其它武器']).toBeUndefined();

    expect((result.state.equipmentSlot1 as any)?.id).toBe('w-A');
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-B');
    expect((result.state.equipmentSlot1 as any)?.fromSlot).toBe('equipmentSlot1');
    expect((result.state.equipmentSlot1 as any)?.amplifyBonus).toBe(1);
    expect((result.state.equipmentSlot2 as any)?.amplifyBonus).toBeUndefined();
  });

  it('盾牌也适用：armor / armorMax 通过 amplifyBonus 增幅', () => {
    const card = makeCard('m-shield');
    const shield = makeShield({ id: 's-1', name: '坚盾', value: 2, armorMax: 2, fromSlot: 'equipmentSlot1' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield as any,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['坚盾']).toBe(1);
    expect((result.state.equipmentSlot2 as any)?.amplifyBonus).toBe(1);
  });

  it('怪物装备同样适用', () => {
    const card = makeCard('m-mon');
    const eq = makeMonsterEquip({ id: 'eq-m1', name: '骷髅之刃' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: eq as any,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['骷髅之刃']).toBe(1);
    expect((result.state.equipmentSlot2 as any)?.id).toBe('eq-m1');
  });
});

// ---------------------------------------------------------------------------
// 边界：空槽拒绝
// ---------------------------------------------------------------------------

describe('淬铸迁位 — 空槽拒绝', () => {
  it('选中空槽：banner 提示 + magic 未消耗（pendingMagicAction 仍保留）', () => {
    const card = makeCard('empty');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 不入队 AMPLIFY_CARDS_BY_NAME
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBeUndefined();

    // banner 提示
    expect(result.state.heroSkillBanner).toContain('该装备栏为空');

    // magic 未消耗：pendingMagicAction 保留供重选
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('amplify-equipment-shift');
  });
});

// ---------------------------------------------------------------------------
// Reserve promote
// ---------------------------------------------------------------------------

describe('淬铸迁位 — reserve promote', () => {
  it('原槽有 reserve：移动后 reserve 自动 promote 到原槽', () => {
    const card = makeCard('reserve');
    const main = makeWeapon({ id: 'w-main', name: '主刃', value: 3, fromSlot: 'equipmentSlot1' });
    const reserve = makeWeapon({ id: 'w-rsv', name: '储备刃', value: 2, fromSlot: 'equipmentSlot1' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: main as any,
      equipmentSlot1Reserve: [reserve] as any,
      equipmentSlot2: null,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // main 搬到右槽
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-main');
    // reserve promote 到左槽（main 的位置）
    expect((result.state.equipmentSlot1 as any)?.id).toBe('w-rsv');
    expect(result.state.equipmentSlot1Reserve.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Echo
// ---------------------------------------------------------------------------

describe('淬铸迁位 — 法术回响', () => {
  it('Echo ×2：增幅 +2，移动只发生 1 次', () => {
    const card = makeCard('echo');
    const weapon = makeWeapon({ id: 'w-echo', name: '回响刃', value: 3, fromSlot: 'equipmentSlot1' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon as any,
      equipmentSlot2: null,
      pendingMagicAction: {
        card,
        effect: 'amplify-equipment-shift',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    // 增幅 ×2
    expect(result.state.amplifiedCardBonus['回响刃']).toBe(2);
    expect((result.state.equipmentSlot2 as any)?.amplifyBonus).toBe(2);

    // 移动只发生 1 次：装备最终在右槽，左槽空（不会因 echo 来回搬动）
    expect(result.state.equipmentSlot1).toBeNull();
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-echo');
  });

  it('Echo ×3 + 双栏都有装备：增幅 +3，不移动', () => {
    const card = makeCard('echo3');
    const w1 = makeWeapon({ id: 'w-A', name: '回响刃', value: 3, fromSlot: 'equipmentSlot1' });
    const w2 = makeWeapon({ id: 'w-B', name: '其它', value: 4, fromSlot: 'equipmentSlot2' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: w1 as any,
      equipmentSlot2: w2 as any,
      pendingMagicAction: {
        card,
        effect: 'amplify-equipment-shift',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 3,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['回响刃']).toBe(3);
    expect((result.state.equipmentSlot1 as any)?.id).toBe('w-A');
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-B');
  });
});

// ---------------------------------------------------------------------------
// 全场同名传染
// ---------------------------------------------------------------------------

describe('淬铸迁位 — 全场同名传染', () => {
  it('手牌 / 背包 / 坟场 / 储备 中的同名卡都 +1', () => {
    const card = makeCard('spread');
    const equipped = makeWeapon({ id: 'w-eq', name: '汰换之刃', value: 3, fromSlot: 'equipmentSlot1' });
    const inHand = makeWeapon({ id: 'w-hand', name: '汰换之刃', value: 3 });
    const inBackpack = makeWeapon({ id: 'w-bp', name: '汰换之刃', value: 3 });
    const inGrave = makeWeapon({ id: 'w-gy', name: '汰换之刃', value: 3 });
    const inReserve = makeWeapon({ id: 'w-rsv', name: '汰换之刃', value: 3 });
    const state = makeState({
      handCards: [card, inHand],
      equipmentSlot1: equipped as any,
      equipmentSlot2: null,
      equipmentSlot1Reserve: [inReserve] as any,
      backpackItems: [inBackpack] as any,
      discardedCards: [inGrave] as any,
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);

    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(1);
    // 装备搬到右槽，amplifyBonus +1
    expect((result.state.equipmentSlot2 as any)?.amplifyBonus).toBe(1);
    // 手牌中的同名 +1（只看 weapon 那一张，不算 magic 卡）
    const handWeapon = result.state.handCards.find(c => c.id === 'w-hand');
    expect((handWeapon as any)?.amplifyBonus).toBe(1);
    // 背包 +1
    const bpWeapon = result.state.backpackItems.find(c => c.id === 'w-bp');
    expect((bpWeapon as any)?.amplifyBonus).toBe(1);
    // 坟场 +1
    const gyWeapon = result.state.discardedCards.find(c => c.id === 'w-gy');
    expect((gyWeapon as any)?.amplifyBonus).toBe(1);
    // 储备（reserve promote 到左槽，因为 main 搬走了）+1
    expect((result.state.equipmentSlot1 as any)?.id).toBe('w-rsv');
    expect((result.state.equipmentSlot1 as any)?.amplifyBonus).toBe(1);
  });

  it('已有 amplifiedCardBonus 累计：再次打出累加（map 2，所有同名卡 +1 = +2 总）', () => {
    const card = makeCard('cum');
    const equipped = makeWeapon({ id: 'w-eq', name: '汰换之刃', value: 3, fromSlot: 'equipmentSlot1' });
    const state = makeState({
      handCards: [card],
      equipmentSlot1: { ...equipped, amplifyBonus: 1, attack: 4 } as any,
      equipmentSlot2: null,
      amplifiedCardBonus: { 汰换之刃: 1 },
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(2);
    expect((result.state.equipmentSlot2 as any)?.amplifyBonus).toBe(2);
  });
});
