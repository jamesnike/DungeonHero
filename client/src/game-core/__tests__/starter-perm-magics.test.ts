/**
 * 起始背包：永久魔法新卡
 *   1. 锐意鼓舞 (flankSlotTempAttack)
 *   2. 运势博弈 (deckTopSwapGold)
 *
 * 注：连环转律 已迁移到专属卡池（knightEffect: 'transform-streak-strike'，唯一）。
 * 它的测试在 `knight-transform-streak-strike.test.ts`。
 *
 * 通过 PLAY_CARD → drain 走完整反应器/分发管线，并检验 pendingMagicAction、
 * slotTempAttack、gold、handCards 等关键状态。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
// Importing this barrel registers all card definitions including the 3 new
// starter perm magics under `starter:starter-perm-...` effectIds.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

// 后缀必须形如 `-pick-N` 或 `-evt-N-xxxx`，否则 getStarterBaseId 不会剥离它。
function pickSuffix(n: number): string {
  return `-pick-${n}`;
}

function makeFlankBuffCard(suffix = '', upgradeLevel = 0): GameCardData {
  return {
    id: `${STARTER_CARD_IDS.flankSlotTempAttack}${suffix}`,
    type: 'magic',
    name: '锐意鼓舞',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 1,
    maxUpgradeLevel: 1,
    upgradeLevel,
  } as GameCardData;
}

function makeDeckSwapCard(suffix = ''): GameCardData {
  return {
    id: `${STARTER_CARD_IDS.deckTopSwapGold}${suffix}`,
    type: 'magic',
    name: '运势博弈',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 2,
    maxUpgradeLevel: 0,
  } as GameCardData;
}

function makeMonster(id: string, hp = 5, attack = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 1,
    image: '',
    hp,
    maxHp: hp,
    attack,
  } as GameCardData;
}

function makePotion(id: string): GameCardData {
  return {
    id,
    type: 'potion',
    name: '小药水',
    value: 1,
    image: '',
    potionEffect: 'heal',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) 锐意鼓舞 — flank slot temp attack
// ---------------------------------------------------------------------------

describe('锐意鼓舞 (flankSlotTempAttack)', () => {
  it('非侧击（牌位于中间）：左装备栏 +3 临时攻击', () => {
    const card = makeFlankBuffCard(pickSuffix(1));
    const left = makePotion('p-left');
    const right = makePotion('p-right');
    const state = makeState({
      handCards: [left, card, right],
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(3);
    expect(result.state.slotTempAttack?.equipmentSlot2 ?? 0).toBe(0);
  });

  it('侧击（手牌只有自己一张）：右装备栏 +3 临时攻击', () => {
    const card = makeFlankBuffCard(pickSuffix(2));
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(3);
    expect(result.state.slotTempAttack?.equipmentSlot1 ?? 0).toBe(0);
  });

  it('升级 1：非侧击 → 左装备栏 +5；侧击 → 右装备栏 +5', () => {
    const cardA = makeFlankBuffCard(pickSuffix(6), 1);
    const leftA = makePotion('p-l-up');
    const rightA = makePotion('p-r-up');
    let state = makeState({
      handCards: [leftA, cardA, rightA],
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: cardA.id } as GameAction]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5);

    const cardB = makeFlankBuffCard(pickSuffix(7), 1);
    state = makeState({
      handCards: [cardB],
      slotTempAttack: { equipmentSlot1: 0, equipmentSlot2: 0 },
    });
    result = drain(state, [{ type: 'PLAY_CARD', cardId: cardB.id } as GameAction]);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(5);
  });

  it('非侧击：累加在已有 slotTempAttack 上', () => {
    const card = makeFlankBuffCard(pickSuffix(8));
    const left = makePotion('p-l-acc');
    const right = makePotion('p-r-acc');
    const state = makeState({
      handCards: [left, card, right],
      slotTempAttack: { equipmentSlot1: 2, equipmentSlot2: 7 },
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(5);
    expect(result.state.slotTempAttack?.equipmentSlot2).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 2) 运势博弈 — deck-top swap with gold reward
// ---------------------------------------------------------------------------

describe('运势博弈 (deckTopSwapGold)', () => {
  it('牌堆为空：消耗自身、不交换、不改变金币、但仍从背包抽 1 张牌', () => {
    const card = makeDeckSwapCard(pickSuffix(9));
    const monster = makeMonster('m1');
    const bp1 = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1] as any,
      activeCards: [monster, null, null, null, null] as any,
      remainingDeck: [] as any,
      gold: 50,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(50);
    expect(result.state.pendingMagicAction).toBeNull();
    expect((result.state.activeCards as any[]).find(c => c?.id === 'm1')).toBeDefined();
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.backpackItems.some(c => c.id === 'bp-1')).toBe(false);
  });

  it('当前行无卡牌：消耗自身、不交换、不改变金币、但仍从背包抽 1 张牌', () => {
    const card = makeDeckSwapCard(pickSuffix(10));
    const bp1 = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1] as any,
      activeCards: [null, null, null, null, null] as any,
      remainingDeck: [makePotion('top')] as any,
      gold: 50,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(50);
    expect(result.state.pendingMagicAction).toBeNull();
    expect((result.state.remainingDeck as any[])[0]?.id).toBe('top');
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.backpackItems.some(c => c.id === 'bp-1')).toBe(false);
  });

  it('正常出牌时打开 dungeon-select pendingMagicAction（抽牌延迟到结算阶段）', () => {
    const card = makeDeckSwapCard(pickSuffix(11));
    const monster = makeMonster('m1');
    const bp1 = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1] as any,
      activeCards: [monster, null, null, null, null] as any,
      remainingDeck: [makePotion('top')] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('deck-top-swap-gold');
    expect((result.state.pendingMagicAction as any).step).toBe('dungeon-select');
    // 选择阶段还没结算，背包不应该被消耗
    expect(result.state.backpackItems.some(c => c.id === 'bp-1')).toBe(true);
  });

  it('选中 active 行卡 + 牌堆顶同类（怪物 vs 怪物）→ +10 金币 & 交换 & 抽 1 张牌', () => {
    const card = makeDeckSwapCard(pickSuffix(12));
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 7);
    const bp1 = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2] as any,
      gold: 50,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.gold).toBe(60);
    const slot0 = (result.state.activeCards as any[])[0];
    expect(slot0?.id).toBe('m2');
    const newDeck = result.state.remainingDeck as any[];
    expect(newDeck[0]?.id).toBe('m1');
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.backpackItems.some(c => c.id === 'bp-1')).toBe(false);
  });

  it('选中 active 行卡 + 牌堆顶不同类（怪物 vs 药水）→ -1 金币 & 交换 & 抽 1 张牌', () => {
    const card = makeDeckSwapCard(pickSuffix(13));
    const m1 = makeMonster('m1');
    const potion = makePotion('p-top');
    const bp1 = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [potion] as any,
      gold: 50,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.gold).toBe(49);
    const slot0 = (result.state.activeCards as any[])[0];
    expect(slot0?.id).toBe('p-top');
    const newDeck = result.state.remainingDeck as any[];
    expect(newDeck[0]?.id).toBe('m1');
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.backpackItems.some(c => c.id === 'bp-1')).toBe(false);
  });

  it('回响×2 早退（牌堆为空）：一次性从背包抽 2 张牌', () => {
    const card = makeDeckSwapCard(pickSuffix(14));
    const monster = makeMonster('m1');
    const bp1 = makePotion('bp-1');
    const bp2 = makePotion('bp-2');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1, bp2] as any,
      activeCards: [monster, null, null, null, null] as any,
      remainingDeck: [] as any,
      gold: 50,
      doubleNextMagic: true,
    } as Partial<GameState>);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(50);
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.handCards.some(c => c.id === 'bp-2')).toBe(true);
    expect(result.state.backpackItems.length).toBe(0);
  });

  it('回响×2 成功交换两轮：累计抽 2 张 & 同类两次 +20 金币', () => {
    const card = makeDeckSwapCard(pickSuffix(15));
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 6);
    const m3 = makeMonster('m3', 7);
    const bp1 = makePotion('bp-1');
    const bp2 = makePotion('bp-2');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1, bp2] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2, m3] as any,
      gold: 50,
      doubleNextMagic: true,
    } as Partial<GameState>);
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    // First echo iteration: pick m1 → swap with m2 (monster vs monster, +10), draw 1
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).echoRemaining).toBe(1);
    // Second echo iteration: pick m2 (now in slot 0, which we just swapped in) → swap with m3 (monster vs monster, +10), draw 1
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm2' } as GameAction,
    ]);
    expect(result.state.gold).toBe(70);
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
    expect(result.state.handCards.some(c => c.id === 'bp-2')).toBe(true);
    expect(result.state.backpackItems.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Regression: production-routing test —— 走 applyDerivedCardText 后必须仍
  // 命中 starter:starter-perm-deck-top-swap-gold resolver。
  //
  // 历史 bug：card-text.ts 的 deckTopSwapGold formatter 错误地 return 了
  // `magicEffect: '永久魔法：…'`。`applyDerivedCardText` 把它写进 card.magicEffect
  // 后，`resolveEffectId` 短路到 `magic:永久魔法：…`（未注册），schema 引擎
  // 返回 null → 回退到 `resolvePermanentMagic`（legacy）→ 也没 case → 掉到
  // 末尾 "Fallback: generic permanent magic" 分支 → 整张卡 no-op：不交换、
  // 不改金币、不抽牌。
  //
  // 这条测试通过 applyDerivedCardText 模拟 deck.ts 真实路径；如果 formatter
  // 再次错误地 return magicEffect，这条会立刻挂掉。
  //
  // 同样的脆弱点适用于所有 schema-only starter cards（没有 legacy
  // resolvePermanentMagic switch case 的 starter 卡）：deckTopSwapGold、
  // flankSlotTempAttack、activeRowFlip、apprenticeBolt。它们的 formatter 都
  // 不能 return magicEffect，否则同样会 no-op。
  // -----------------------------------------------------------------------
  it('regression: production routing through applyDerivedCardText still hits the swap resolver', async () => {
    const { applyDerivedCardText } = await import('../card-schema/card-text');
    const baseCard = makeDeckSwapCard(pickSuffix(99));
    // applyDerivedCardText injects formatter output (description / shortDescription / magicEffect) onto the card.
    const cardAfterFormatter = applyDerivedCardText(baseCard);
    // Hard requirement: formatter must NOT inject a `magicEffect` string here,
    // otherwise resolveEffectId short-circuits to `magic:<long-text>` which has
    // no registered definition.
    expect((cardAfterFormatter as any).magicEffect).toBeUndefined();
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 7);
    const bp1 = makePotion('bp-1');
    const state = makeState({
      handCards: [cardAfterFormatter],
      backpackItems: [bp1] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2] as any,
      gold: 50,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: cardAfterFormatter.id } as GameAction]);
    // Schema engine must open dungeon-select pending —— if we fell through to
    // legacy "Fallback: generic permanent magic" the card would just finalize
    // with no pendingMagicAction.
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('deck-top-swap-gold');
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    // Same-category swap (monster vs monster) at L0 → +10 gold (NOT +15 — that's L1).
    expect(result.state.gold).toBe(60);
    const slot0 = (result.state.activeCards as any[])[0];
    expect(slot0?.id).toBe('m2');
    expect((result.state.remainingDeck as any[])[0]?.id).toBe('m1');
    // Draw 1 from backpack.
    expect(result.state.handCards.some(c => c.id === 'bp-1')).toBe(true);
  });

  it('regression: L0 description shows "+10 金币" (matches code), L1 shows "+15 金币"', async () => {
    const { applyDerivedCardText } = await import('../card-schema/card-text');
    const l0 = applyDerivedCardText(makeDeckSwapCard(pickSuffix(101)));
    expect(l0.description).toContain('+10 金币');
    expect(l0.description).not.toContain('+15 金币');
    const l1 = applyDerivedCardText({ ...makeDeckSwapCard(pickSuffix(102)), upgradeLevel: 1 } as any);
    expect(l1.description).toContain('+15 金币');
    expect(l1.description).not.toContain('+10 金币');
  });
});
