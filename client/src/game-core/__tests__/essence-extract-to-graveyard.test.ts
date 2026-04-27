/**
 * 精华萃取 (knight:essence-extract) — 强行送入坟场
 *
 * 历史：旧实现是「从游戏中删除」（filter handCards 但不写 discardedCards），
 * 卡彻底消失，玩家无法从坟场召回 / 残骸回收。
 *
 * 新实现（用户要求）：
 *   - 选中的手牌**强行**进 `discardedCards`（坟场）
 *   - **无视** Perm 路由（即使带 recycleDelay > 0 也不进回收袋；与
 *     `perm-routing-on-discard.mdc` 默认相反，是这条卡明确选择的「force-grave」语义，
 *     与 净册涌泉 `CONFIRM_DELETE_CARD kw='delete'` 行为一致）
 *   - **不**触发 `APPLY_DISCARD_EFFECTS`（onDiscardDraw / catapult / discard-zap 等弃牌联动
 *     不应该跑）
 *   - 槽位永久加成逻辑（slot1 攻击/护甲、slot2 攻击/护甲）保持不变
 *
 * 这条规则横跨多条 cursor rule，所以测试要做矩阵覆盖：
 *   1) 普通（非 Perm）目标 → discardedCards
 *   2) Perm 目标（recycleDelay > 0）→ 仍然 discardedCards，**不**进回收袋
 *   3) permStripped 目标 → discardedCards
 *   4) 目标带 onDiscardDraw → 不抽牌（证明 APPLY_DISCARD_EFFECTS 没跑）
 *   5) 措辞断言：banner / log 用「删除」不是旧的「移除」
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeEssenceExtract(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'essence-extract-card',
    type: 'magic',
    name: '精华萃取',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'essence-extract',
    recycleDelay: 2,
    ...(over ?? {}),
  } as GameCardData;
}

function makeWeapon(id = 'w', over?: Partial<GameCardData>): GameCardData {
  return {
    id, type: 'weapon', name: 'Sword', value: 4, image: '',
    durability: 3, maxDurability: 3,
    ...(over ?? {}),
  } as GameCardData;
}

function makeAmulet(id = 'a', over?: Partial<GameCardData>): GameCardData {
  return {
    id, type: 'amulet', name: 'Charm', value: 0, image: '',
    amuletEffect: 'none' as any,
    ...(over ?? {}),
  } as GameCardData;
}

function makeInstantMagic(id = 'm', over?: Partial<GameCardData>): GameCardData {
  return {
    id, type: 'magic', name: 'Bolt', value: 0, image: '',
    magicType: 'instant',
    ...(over ?? {}),
  } as GameCardData;
}

// Drive PLAY_CARD → resolve modal → assert outcome.
function castEssenceExtractAndPick(state: GameState, targetCardId: string): GameState {
  let r = reduce(state, { type: 'PLAY_CARD', cardId: 'essence-extract-card' });
  let next = drain(r.state, r.enqueuedActions ?? []).state;
  // The modal must open: 精华萃取 always opens it (no auto-pick branch); confirm
  // and resolve picker.
  expect(next.permGrantModal).not.toBeNull();
  expect(next.permGrantModal?.sourceType).toBe('essence-extract');
  r = reduce(next, { type: 'RESOLVE_PERM_GRANT', targetCardId } as any);
  next = drain(r.state, r.enqueuedActions ?? []).state;
  return next;
}

// ---------------------------------------------------------------------------
// 1. 普通（非 Perm）目标 → 进坟场
// ---------------------------------------------------------------------------

describe('精华萃取 强行送入坟场', () => {
  it('非 Perm 武器 → discardedCards（不进回收袋）', () => {
    const target = makeWeapon('target-weapon');
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const next = castEssenceExtractAndPick(state, 'target-weapon');

    expect(next.handCards.find(c => c.id === 'target-weapon')).toBeUndefined();
    expect(next.discardedCards.find(c => c.id === 'target-weapon')).toBeDefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'target-weapon')).toBeUndefined();

    // weapon → equipmentSlot2 + damage +1（按现有 essence-extract 类型分支）
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.damage ?? 0).toBe(1);

    expect(next.permGrantModal).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 2. Perm 目标 → 仍然进坟场，不进回收袋（force-grave 语义的关键断言）
  // ---------------------------------------------------------------------------

  it('Perm 武器（recycleDelay=2）→ discardedCards（**不**进回收袋）', () => {
    const target = makeWeapon('target-perm-weapon', { recycleDelay: 2 } as any);
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const next = castEssenceExtractAndPick(state, 'target-perm-weapon');

    expect(next.handCards.find(c => c.id === 'target-perm-weapon')).toBeUndefined();
    expect(next.discardedCards.find(c => c.id === 'target-perm-weapon')).toBeDefined();
    // 关键：哪怕带 recycleDelay 也不能进回收袋
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'target-perm-weapon')).toBeUndefined();
  });

  it('Perm 护符（recycleDelay=2）→ discardedCards（**不**进回收袋）', () => {
    const target = makeAmulet('target-perm-amulet', { recycleDelay: 2 } as any);
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const next = castEssenceExtractAndPick(state, 'target-perm-amulet');

    expect(next.discardedCards.find(c => c.id === 'target-perm-amulet')).toBeDefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'target-perm-amulet')).toBeUndefined();
    // amulet → equipmentSlot2 + shield +1
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.shield ?? 0).toBe(1);
  });

  it('原生 Perm magic（magicType=permanent + recycleDelay=2）→ discardedCards（**不**进回收袋）', () => {
    const target: any = {
      id: 'target-perm-magic',
      type: 'magic',
      name: '回响残页',
      value: 0,
      image: '',
      magicType: 'permanent',
      recycleDelay: 2,
    };
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const next = castEssenceExtractAndPick(state, 'target-perm-magic');

    expect(next.discardedCards.find(c => c.id === 'target-perm-magic')).toBeDefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'target-perm-magic')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 3. permStripped 目标 → 进坟场
  // ---------------------------------------------------------------------------

  it('permStripped 武器 → discardedCards（permStripped 不影响目的地）', () => {
    const target = makeWeapon('target-stripped', { recycleDelay: 2, permStripped: true } as any);
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const next = castEssenceExtractAndPick(state, 'target-stripped');

    expect(next.discardedCards.find(c => c.id === 'target-stripped')).toBeDefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'target-stripped')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 4. 不触发 APPLY_DISCARD_EFFECTS / onDiscardDraw 联动
  // ---------------------------------------------------------------------------

  it('目标带 onDiscardDraw=2 → 不抽牌（证明 APPLY_DISCARD_EFFECTS 没跑）', () => {
    // onDiscardDraw 仅由 reduceApplyDiscardEffects 触发；如果 essence-extract
    // 误用了 DISCARD_OWNED_CARD 等会触发 APPLY_DISCARD_EFFECTS 的路径，
    // 玩家会从背包抽 2 张。force-grave 语义下，背包应保持原样。
    const target = makeWeapon('target-with-discard-draw', { onDiscardDraw: 2 } as any);
    const filler1 = makeWeapon('back-1', { name: 'BackFiller1' });
    const filler2 = makeWeapon('back-2', { name: 'BackFiller2' });
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      backpackItems: [filler1, filler2] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const initialBackpackCount = state.backpackItems.length;
    const initialHandIds = state.handCards.map(c => c.id);

    const next = castEssenceExtractAndPick(state, 'target-with-discard-draw');

    expect(next.discardedCards.find(c => c.id === 'target-with-discard-draw')).toBeDefined();
    // 背包不应被抽走任何卡
    expect(next.backpackItems.length).toBe(initialBackpackCount);
    // 手牌应该只少了 essence-extract（出牌后进回收袋）+ target（被删除），
    // 不应该多出任何「onDiscardDraw 抽来的」卡
    const expectedHandIds = initialHandIds.filter(
      id => id !== 'essence-extract-card' && id !== 'target-with-discard-draw',
    );
    const actualHandIds = next.handCards.map(c => c.id).sort();
    expect(actualHandIds).toEqual(expectedHandIds.sort());
  });

  // ---------------------------------------------------------------------------
  // 5. 措辞：banner / log 应该是「删除」不是旧的「移除」
  // ---------------------------------------------------------------------------

  it('log 措辞使用「删除」，不再使用旧的「移除」', () => {
    const target = makeInstantMagic('target-instant-magic');
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
    });

    const r1 = reduce(state, { type: 'PLAY_CARD', cardId: 'essence-extract-card' });
    const drained1 = drain(r1.state, r1.enqueuedActions ?? []);
    const r2 = reduce(drained1.state, { type: 'RESOLVE_PERM_GRANT', targetCardId: 'target-instant-magic' } as any);
    const drained2 = drain(r2.state, r2.enqueuedActions ?? []);

    const allEvents = [...drained1.sideEffects, ...drained2.sideEffects, ...r2.sideEffects];
    const logEvents = allEvents.filter(e => e.event === 'log:entry');
    const bannerEvents = allEvents.filter(e => e.event === 'ui:banner');

    const allText = [
      ...logEvents.map(e => (e as any).payload?.message ?? ''),
      ...bannerEvents.map(e => (e as any).payload?.text ?? ''),
    ].join('\n');

    expect(allText).toContain('删除');
    expect(allText).not.toMatch(/精华萃取：移除/);

    // instant magic → equipmentSlot1 + damage +1
    expect(drained2.state.equipmentSlotBonuses?.equipmentSlot1?.damage ?? 0).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. 末尾 sanity：精华萃取自身（Perm 2 magic）出牌完成后进回收袋
  // ---------------------------------------------------------------------------

  it('源卡（精华萃取）出牌后进回收袋（Perm 2 默认行为，未受改动影响）', () => {
    const target = makeWeapon('any-target');
    const state = makeState({
      handCards: [makeEssenceExtract(), target] as any,
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });

    const next = castEssenceExtractAndPick(state, 'any-target');

    expect(
      next.permanentMagicRecycleBag.find(c => c.id === 'essence-extract-card'),
    ).toBeDefined();
    expect(
      next.discardedCards.find(c => c.id === 'essence-extract-card'),
    ).toBeUndefined();
  });
});
