/**
 * Monster Fusion (`魔物融合`) — interactive modal flow.
 *
 * 设计契约：
 *   1. PLAY_CARD 「魔物融合」 → 检查 4 个来源（装备栏 surface/reserve、手牌、
 *      背包）有无 ≥ 2 张同种族怪物 → 有则开 modal；没则显示「无可融合」banner。
 *   2. RESOLVE_MONSTER_FUSION:
 *      - selectedIds 必须是 2 张同种族（非 Skeleton）或 3 张 Skeleton
 *      - 所选卡必须存在于 4 个来源之一 + 必须为 type === 'monster'
 *      - 所有被消耗的怪物 → ADD_TO_GRAVEYARD（无视 Perm flag，全部进坟场）
 *      - 融合产物（精英/骷髅王）ADD_CARD_TO_HAND
 *   3. CANCEL_MONSTER_FUSION → 清掉 modal、消耗源卡（魔物融合本身），但不融合。
 *
 * fixture 用 `phase: 'playerInput'` 走真实 dispatch 链，符合
 * pipeline-input-continuation.mdc 的要求。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState, GameCardData } from '../types';
import type { EquipmentItem } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  // Use default phase ('idle') so drain() does NOT pause on user-dispatched
  // modal resolve actions (RESOLVE/CANCEL_MONSTER_FUSION). In production these
  // actions are dispatched via engine.dispatch which calls reduce() directly,
  // bypassing pipeline gating; tests mirror this by not entering INPUT_PHASES.
  // (Same pattern as amplify-target-wide-potion.test.ts.)
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(over: Partial<GameCardData> & { id: string; name: string; monsterType: string }): GameCardData {
  return {
    type: 'monster',
    value: 3,
    attack: 3,
    baseAttack: 3,
    hp: 4,
    maxHp: 4,
    baseHp: 4,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    rageTurn: 10,
    durability: 1,
    maxDurability: 1,
    ...over,
  } as GameCardData;
}

function makeFusionCard(): GameCardData {
  return {
    id: 'fusion-1',
    type: 'magic',
    name: '魔物融合',
    value: 0,
    magicType: 'instant',
    magicEffect: '融合装备栏中同种族的怪物装备。',
    knightEffect: 'monster-fusion',
    classCard: true,
    description: '融合',
  } as GameCardData;
}

describe('Monster Fusion modal flow', () => {
  it('PLAY_CARD opens modal when ≥2 same-race monsters exist across all sources', () => {
    const fusion = makeFusionCard();
    const goblin1 = makeMonster({ id: 'g1', name: 'Goblin', monsterType: 'Goblin' });
    const goblin2 = makeMonster({ id: 'g2', name: 'Goblin', monsterType: 'Goblin' });

    const state = makeState({
      handCards: [fusion, goblin1],
      backpackItems: [goblin2 as EquipmentItem],
    });

    const { state: out } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);

    expect(out.monsterFusionModal).not.toBeNull();
    expect(out.monsterFusionModal?.sourceCardId).toBe(fusion.id);
    expect(out.pendingMagicAction?.card.id).toBe(fusion.id);
  });

  it('PLAY_CARD shows banner and finalizes when no fusible group exists', () => {
    const fusion = makeFusionCard();
    const goblin = makeMonster({ id: 'g1', name: 'Goblin', monsterType: 'Goblin' });
    const skel = makeMonster({ id: 's1', name: 'Skeleton', monsterType: 'Skeleton' });

    const state = makeState({
      handCards: [fusion, goblin, skel],
      backpackItems: [],
    });

    const { state: out, sideEffects } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);

    expect(out.monsterFusionModal).toBeNull();
    expect(sideEffects.some(e => e.event === 'ui:banner' && /无可融合|没有/.test((e.payload as { text?: string }).text ?? ''))).toBe(true);
  });

  it('RESOLVE with 2 same-race monsters fuses to elite, sends both to graveyard, adds product to hand', () => {
    const fusion = makeFusionCard();
    const g1 = makeMonster({ id: 'g1', name: 'Goblin', monsterType: 'Goblin', attack: 3, hp: 4 });
    const g2 = makeMonster({ id: 'g2', name: 'Goblin', monsterType: 'Goblin', attack: 3, hp: 4 });

    const state = makeState({
      handCards: [fusion, g1],
      backpackItems: [g2 as EquipmentItem],
    });

    let { state: s1 } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    expect(s1.monsterFusionModal).not.toBeNull();

    const { state: s2 } = drain(s1, [
      { type: 'RESOLVE_MONSTER_FUSION', selection: { cardIds: ['g1', 'g2'] } },
    ]);

    expect(s2.monsterFusionModal).toBeNull();
    expect(s2.handCards.find(c => c.id === 'g1')).toBeUndefined();
    expect(s2.backpackItems.find(c => c.id === 'g2')).toBeUndefined();
    expect(s2.discardedCards.find(c => c.id === 'g1')).toBeDefined();
    expect(s2.discardedCards.find(c => c.id === 'g2')).toBeDefined();

    const fused = s2.handCards.find(c => c.name === '精英哥布林' || c.name.startsWith('精英'));
    expect(fused).toBeDefined();
    expect(fused!.type).toBe('monster');
    expect((fused as { attack?: number }).attack).toBe(6);
    expect((fused as { hp?: number }).hp).toBe(8);
    expect((fused as { durability?: number }).durability).toBe(4);
    expect((fused as { maxDurability?: number }).maxDurability).toBe(4);
  });

  it('RESOLVE with 3 Skeletons fuses to "骷髅王"', () => {
    const fusion = makeFusionCard();
    const s1 = makeMonster({ id: 's1', name: 'Skeleton', monsterType: 'Skeleton' });
    const s2 = makeMonster({ id: 's2', name: 'Skeleton', monsterType: 'Skeleton' });
    const s3 = makeMonster({ id: 's3', name: 'Skeleton', monsterType: 'Skeleton' });

    const state = makeState({
      handCards: [fusion, s1, s2],
      backpackItems: [s3 as EquipmentItem],
    });

    const { state: opened } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    expect(opened.monsterFusionModal).not.toBeNull();

    const { state: out } = drain(opened, [
      { type: 'RESOLVE_MONSTER_FUSION', selection: { cardIds: ['s1', 's2', 's3'] } },
    ]);

    expect(out.discardedCards.find(c => c.id === 's1')).toBeDefined();
    expect(out.discardedCards.find(c => c.id === 's2')).toBeDefined();
    expect(out.discardedCards.find(c => c.id === 's3')).toBeDefined();

    const king = out.handCards.find(c => c.name === '骷髅王');
    expect(king).toBeDefined();
    expect((king as { attack?: number }).attack).toBe(10);
    expect((king as { hp?: number }).hp).toBe(10);
    expect((king as { hasRevive?: boolean }).hasRevive).toBe(true);
  });

  it('RESOLVE rejects 3-card fusion when not all Skeletons', () => {
    const fusion = makeFusionCard();
    const g1 = makeMonster({ id: 'g1', name: 'Goblin', monsterType: 'Goblin' });
    const g2 = makeMonster({ id: 'g2', name: 'Goblin', monsterType: 'Goblin' });
    const g3 = makeMonster({ id: 'g3', name: 'Goblin', monsterType: 'Goblin' });

    const state = makeState({
      handCards: [fusion, g1, g2, g3],
      backpackItems: [],
    });

    const { state: opened } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    const { state: out, sideEffects } = drain(opened, [
      { type: 'RESOLVE_MONSTER_FUSION', selection: { cardIds: ['g1', 'g2', 'g3'] } },
    ]);

    expect(out.monsterFusionModal).toBeNull();
    expect(sideEffects.some(e => e.event === 'ui:banner' && /Skeleton/.test((e.payload as { text?: string }).text ?? ''))).toBe(true);
    // 卡未被消耗 — Goblins 应仍在手牌
    expect(out.handCards.find(c => c.id === 'g1')).toBeDefined();
    expect(out.handCards.find(c => c.id === 'g2')).toBeDefined();
    expect(out.handCards.find(c => c.id === 'g3')).toBeDefined();
  });

  it('RESOLVE rejects mixed-race selection', () => {
    const fusion = makeFusionCard();
    const g1 = makeMonster({ id: 'g1', name: 'Goblin', monsterType: 'Goblin' });
    const sk1 = makeMonster({ id: 'sk1', name: 'Skeleton', monsterType: 'Skeleton' });
    // need at least 2 same race somewhere so PLAY_CARD opens the modal
    const g2 = makeMonster({ id: 'g2', name: 'Goblin', monsterType: 'Goblin' });

    const state = makeState({
      handCards: [fusion, g1, sk1, g2],
      backpackItems: [],
    });

    const { state: opened } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    expect(opened.monsterFusionModal).not.toBeNull();

    const { state: out, sideEffects } = drain(opened, [
      { type: 'RESOLVE_MONSTER_FUSION', selection: { cardIds: ['g1', 'sk1'] } },
    ]);

    expect(out.monsterFusionModal).toBeNull();
    expect(sideEffects.some(e => e.event === 'ui:banner' && /同种族/.test((e.payload as { text?: string }).text ?? ''))).toBe(true);
    expect(out.handCards.find(c => c.id === 'g1')).toBeDefined();
    expect(out.handCards.find(c => c.id === 'sk1')).toBeDefined();
  });

  it('RESOLVE consumes Perm-flagged monsters into graveyard (NOT recycle bag)', () => {
    const fusion = makeFusionCard();
    const g1 = makeMonster({
      id: 'g1', name: 'Goblin', monsterType: 'Goblin',
      recycleDelay: 2, // Perm-bound by 永恒铭刻
    });
    const g2 = makeMonster({
      id: 'g2', name: 'Goblin', monsterType: 'Goblin',
      permEquipment: true,
    });

    const state = makeState({
      handCards: [fusion],
      backpackItems: [g1 as EquipmentItem, g2 as EquipmentItem],
    });

    const { state: opened } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    const { state: out } = drain(opened, [
      { type: 'RESOLVE_MONSTER_FUSION', selection: { cardIds: ['g1', 'g2'] } },
    ]);

    // 关键不变量：所有被消耗的怪物全部进坟场，不进回收袋
    expect(out.discardedCards.find(c => c.id === 'g1')).toBeDefined();
    expect(out.discardedCards.find(c => c.id === 'g2')).toBeDefined();
    expect(out.permanentMagicRecycleBag.find(c => c.id === 'g1')).toBeUndefined();
    expect(out.permanentMagicRecycleBag.find(c => c.id === 'g2')).toBeUndefined();
  });

  it('CANCEL clears modal and finalizes magic card without consuming monsters', () => {
    const fusion = makeFusionCard();
    const g1 = makeMonster({ id: 'g1', name: 'Goblin', monsterType: 'Goblin' });
    const g2 = makeMonster({ id: 'g2', name: 'Goblin', monsterType: 'Goblin' });

    const state = makeState({
      handCards: [fusion, g1, g2],
      backpackItems: [],
    });

    const { state: opened } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    expect(opened.monsterFusionModal).not.toBeNull();

    const { state: out } = drain(opened, [{ type: 'CANCEL_MONSTER_FUSION' }]);

    expect(out.monsterFusionModal).toBeNull();
    expect(out.handCards.find(c => c.id === 'g1')).toBeDefined();
    expect(out.handCards.find(c => c.id === 'g2')).toBeDefined();
    expect(out.discardedCards.find(c => c.id === 'g1')).toBeUndefined();
    expect(out.discardedCards.find(c => c.id === 'g2')).toBeUndefined();
  });

  it('Source from equipment surface + reserve correctly removes from both', () => {
    const fusion = makeFusionCard();
    const surface = makeMonster({ id: 'sfc', name: 'Goblin', monsterType: 'Goblin' });
    const reserveCard = makeMonster({ id: 'rsv', name: 'Goblin', monsterType: 'Goblin' });

    const state = makeState({
      handCards: [fusion],
      equipmentSlot1: surface as unknown as EquipmentItem,
      equipmentSlot1Reserve: [reserveCard as unknown as EquipmentItem],
    });

    const { state: opened } = drain(state, [{ type: 'PLAY_CARD', cardId: fusion.id }]);
    expect(opened.monsterFusionModal).not.toBeNull();

    const { state: out } = drain(opened, [
      { type: 'RESOLVE_MONSTER_FUSION', selection: { cardIds: ['sfc', 'rsv'] } },
    ]);

    expect(out.equipmentSlot1).toBeNull();
    expect(out.equipmentSlot1Reserve).toEqual([]);
    expect(out.discardedCards.find(c => c.id === 'sfc')).toBeDefined();
    expect(out.discardedCards.find(c => c.id === 'rsv')).toBeDefined();
    expect(out.handCards.some(c => c.name === '精英哥布林')).toBe(true);
  });
});
