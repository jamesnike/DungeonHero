/**
 * 「增幅秘药」（knight 专属 potion，effectId: 'potion:amplify-target-wide'）
 *
 * 与主牌堆「增幅」magic 的区别：
 *  1. 是 potion，源走 pendingPotionAction → finalize 走 FINALIZE_POTION_CARD。
 *  2. 目标范围 = 装备栏 + 手牌 + 背包（wide scope）；主牌堆 magic 只到装备栏 + 手牌。
 *  3. amplifyModal.scope='wide' / sourceType='potion' 是路由的两个关键字段。
 *
 * 共享：复用 RESOLVE_AMPLIFY / CANCEL_AMPLIFY + reduceResolveAmplify，
 *      生成 Perm 1 「增幅：${name}」放入背包；后续打出 Perm 卡才真正应用增幅。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction, GameCardData } from '../actions';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makePotion(): GameCardData {
  return {
    id: 'pot-amp-wide-1',
    type: 'potion',
    name: '增幅秘药',
    value: 0,
    classCard: true,
    potionEffect: 'amplify-target-wide',
  } as GameCardData;
}

function makeBolt(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: '魔弹',
    value: 0,
    magicType: 'instant',
    knightEffect: 'missile-bolt',
  } as GameCardData;
}

function makeWeapon(id: string): GameCardData {
  return {
    id,
    type: 'weapon',
    name: '测试之刃',
    value: 2,
    durability: 2,
    maxDurability: 2,
  } as GameCardData;
}

describe('增幅秘药（knight 专属 potion）— wide scope amplify', () => {
  it('PLAY_CARD：装备栏/手牌/背包都没有可增幅的目标 → banner，不打开 modal', () => {
    const potion = makePotion();
    const state = makeState({ handCards: [potion] });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: potion.id } as GameAction]);

    expect(drained.state.amplifyModal).toBeNull();
    expect(drained.state.handCards.find(c => c.id === potion.id)).toBeUndefined();
    expect(drained.sideEffects.some(
      s => s.event === 'ui:banner' && /没有可增幅/.test((s.payload as any)?.text ?? ''),
    )).toBe(true);
  });

  it('PLAY_CARD：背包中有伤害魔法 → 打开 wide-scope modal（amplifyModal.scope=wide, sourceType=potion）', () => {
    const potion = makePotion();
    const bolt = makeBolt('bp-bolt-1');
    const state = makeState({
      handCards: [potion],
      backpackItems: [bolt],
    });

    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: potion.id } as GameAction]);

    expect(drained.state.amplifyModal).not.toBeNull();
    expect(drained.state.amplifyModal?.sourceCardId).toBe(potion.id);
    expect(drained.state.amplifyModal?.scope).toBe('wide');
    expect(drained.state.amplifyModal?.sourceType).toBe('potion');
    expect(drained.state.handCards.find(c => c.id === potion.id)).toBeUndefined();
    expect((drained.state as any).pendingPotionAction?.card?.id).toBe(potion.id);
    expect((drained.state as any).pendingPotionAction?.effect).toBe('amplify-target-wide');
  });

  it('RESOLVE_AMPLIFY with kind=backpack：生成 Perm 1「增幅：魔弹」放入背包，pendingPotionAction 清空', () => {
    const potion = makePotion();
    const bolt = makeBolt('bp-bolt-1');
    const state = makeState({
      handCards: [potion],
      backpackItems: [bolt],
    });

    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: potion.id } as GameAction,
      { type: 'RESOLVE_AMPLIFY', selection: { kind: 'backpack', cardId: bolt.id } } as GameAction,
    ]);

    expect(drained.state.amplifyModal).toBeNull();
    expect((drained.state as any).pendingPotionAction).toBeNull();

    // Perm 1 卡进入背包
    const ampPerm = drained.state.backpackItems.find(c => c.name === '增幅：魔弹');
    expect(ampPerm).toBeDefined();
    expect(ampPerm?.magicType).toBe('permanent');
    expect(ampPerm?.recycleDelay).toBe(1);
    expect(ampPerm?.magicEffect).toBe('amplify-target');
    expect((ampPerm as any)?._amplifyTargetName).toBe('魔弹');

    // potion 已 finalize（不在手牌里）
    expect(drained.state.handCards.find(c => c.id === potion.id)).toBeUndefined();
  });

  it('打出生成的 Perm 1「增幅：魔弹」后：amplifiedCardBonus[魔弹] = 1，所有同名卡 +1', () => {
    const potion = makePotion();
    const boltInBackpack = makeBolt('bp-bolt-1');
    const boltInHand = makeBolt('h-bolt-1');
    const state = makeState({
      handCards: [potion, boltInHand],
      backpackItems: [boltInBackpack],
    });

    // 1) 用药剂生成 Perm 1
    const afterPotion = drain(state, [
      { type: 'PLAY_CARD', cardId: potion.id } as GameAction,
      { type: 'RESOLVE_AMPLIFY', selection: { kind: 'backpack', cardId: boltInBackpack.id } } as GameAction,
    ]);
    const ampPerm = afterPotion.state.backpackItems.find(c => c.name === '增幅：魔弹')!;
    expect(ampPerm).toBeDefined();

    // 2) 后续打出该 Perm 卡，触发 amplify-target → AMPLIFY_CARDS_BY_NAME
    const afterAmplify = drain(afterPotion.state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(afterAmplify.state.amplifiedCardBonus['魔弹']).toBe(1);
    expect(afterAmplify.state.handCards.find(c => c.id === 'h-bolt-1')?.amplifyBonus).toBe(1);
    expect(afterAmplify.state.backpackItems.find(c => c.id === 'bp-bolt-1')?.amplifyBonus).toBe(1);
  });

  it('RESOLVE_AMPLIFY with kind=hand：仍然走 potion 路径（pendingPotionAction 清空）', () => {
    const potion = makePotion();
    const handBolt = makeBolt('h-bolt-1');
    const state = makeState({ handCards: [potion, handBolt] });

    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: potion.id } as GameAction,
      { type: 'RESOLVE_AMPLIFY', selection: { kind: 'hand', cardId: handBolt.id } } as GameAction,
    ]);

    expect(drained.state.amplifyModal).toBeNull();
    expect((drained.state as any).pendingPotionAction).toBeNull();
    const ampPerm = drained.state.backpackItems.find(c => c.name === '增幅：魔弹');
    expect(ampPerm?.recycleDelay).toBe(1);
  });

  it('RESOLVE_AMPLIFY with kind=equipment：装备栏装备生成 Perm 1', () => {
    const potion = makePotion();
    const blade = makeWeapon('eq-blade-1');
    const state = makeState({ handCards: [potion], equipmentSlot1: blade });

    const drained = drain(state, [
      { type: 'PLAY_CARD', cardId: potion.id } as GameAction,
      { type: 'RESOLVE_AMPLIFY', selection: { kind: 'equipment', slotId: 'equipmentSlot1' } } as GameAction,
    ]);

    expect(drained.state.amplifyModal).toBeNull();
    const ampPerm = drained.state.backpackItems.find(c => c.name === '增幅：测试之刃');
    expect(ampPerm).toBeDefined();
    expect(ampPerm?.recycleDelay).toBe(1);
    expect((ampPerm as any)?._amplifyTargetName).toBe('测试之刃');
  });

  it('CANCEL_AMPLIFY：potion 路径走 FINALIZE_POTION_CARD（pendingPotionAction 清空，无 Perm 卡生成）', () => {
    const potion = makePotion();
    const bolt = makeBolt('bp-bolt-1');
    const state = makeState({
      handCards: [potion],
      backpackItems: [bolt],
    });

    const opened = drain(state, [{ type: 'PLAY_CARD', cardId: potion.id } as GameAction]);
    expect(opened.state.amplifyModal?.sourceType).toBe('potion');

    const cancelled = drain(opened.state, [{ type: 'CANCEL_AMPLIFY' } as GameAction]);

    expect(cancelled.state.amplifyModal).toBeNull();
    expect((cancelled.state as any).pendingPotionAction).toBeNull();
    expect(cancelled.state.backpackItems.find(c => c.name?.startsWith('增幅：'))).toBeUndefined();
    expect(cancelled.state.handCards.find(c => c.id === potion.id)).toBeUndefined(); // potion finalize
  });
});
