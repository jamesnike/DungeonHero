/**
 * 「右翼回响」事件 — 6 选项 happy path / 右邻 monster 触发 / 最右栏不触发 /
 * requirements 置灰屏蔽 / stay flip / 装甲铸蚀 magic resolver
 *
 * 设计参考：
 *   - 右邻 monster → persuadeNextFree（镜像 战血荣誉 right-side enrage 模式）
 *   - 6 个 eventChoices 都不会自己触发 BEGIN_COMBAT（跟战血荣誉的差异）
 *   - flipTarget: stay → 装甲铸蚀 一次性 magic（slot-select → +2 perm shield bonus）
 *   - 选项眼皮：
 *       1. 选 1 张手牌赋「置顶」 — 全手牌已带「置顶」时 disabled
 *       2. 发现专属牌 + 「置顶」 + 进手牌
 *       3. 永久劝降费用 -2
 *       4. 选 1 张手牌赋「上手」(随机栏 +1 临护甲) — 全手牌已带 onEnterHandEffect 时 disabled
 *       5. 选 1 张手牌赋「侧击」(金币 +2)
 *       6. 选 1 件主装备赋「入场」(下次劝降成功率 +20%) — 主装备全带 onEquipEffect / 主装备全空 时 disabled
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { evaluateChoiceRequirement } from '../events';
import '../card-schema';

// 跟 `pipeline-input-continuation.mdc` 对齐：所有涉及 follow-up action drain
// 的测试 fixture 必须显式 phase: 'playerInput'。这条文件里 reducer-level
// 测试也保持一致 (`evaluateChoiceRequirement` 不需要这条，但保持统一)。
function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

const eventCard = (): GameCardData => ({
  id: 'evt-rwe-1',
  type: 'event' as const,
  name: '右翼回响',
  value: 0,
  eventChoices: [],
});

const monsterCard = (id = 'm-right-1'): GameCardData => ({
  id,
  type: 'monster' as const,
  name: 'Goblin',
  value: 5,
  hp: 10,
  maxHp: 10,
  attack: 5,
});

const weapon = (id = 'w-1', overrides?: Partial<GameCardData>): GameCardData => ({
  id,
  type: 'weapon' as const,
  name: 'Sword',
  value: 5,
  durability: 3,
  maxDurability: 3,
  ...overrides,
});

const shield = (id = 's-1', overrides?: Partial<GameCardData>): GameCardData => ({
  id,
  type: 'shield' as const,
  name: 'Buckler',
  value: 3,
  durability: 2,
  maxDurability: 2,
  ...overrides,
});

const handMagic = (id = 'h-1', overrides?: Partial<GameCardData>): GameCardData => ({
  id,
  type: 'magic' as const,
  name: 'Bolt',
  value: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Right-neighbor monster → persuadeNextFree
// ---------------------------------------------------------------------------

describe('「右翼回响」 right-neighbor persuadeNextFree', () => {
  function makeFixture(rightSlotCard: GameCardData | null) {
    const ec = eventCard();
    const activeCards: any[] = [ec, rightSlotCard, null, null, null];
    const state = makeState({
      activeCards: activeCards as any,
      currentEventCard: ec as any,
      resolvingDungeonCardId: ec.id,
    });
    return { state, eventCard: ec };
  }

  it('right neighbor is monster → after non-interactive choice, persuadeDiscount.costReduction = 999', () => {
    const monster = monsterCard();
    const { state } = makeFixture(monster);
    // 用 option 3 (persuadeLevel+1 + persuadeCost-2)：唯一的非 interactive 选项，
    // drain 必然走完 post-effect block 一次。
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: 'rwe-persuade-cost-2',
        choiceText: '永誓低吟',
        effectTokens: ['persuadeLevel+1', 'persuadeCost-2'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.persuadeDiscount?.costReduction).toBe(999);
  });

  it('right neighbor is non-monster (event) → no persuadeDiscount change', () => {
    const ev2: GameCardData = { id: 'evt-other', type: 'event' as const, name: '别的事件', value: 0 };
    const { state } = makeFixture(ev2);
    const beforeReduction = state.persuadeDiscount?.costReduction ?? 0;
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: 'rwe-persuade-cost-2',
        choiceText: '永誓低吟',
        effectTokens: ['persuadeLevel+1', 'persuadeCost-2'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.persuadeDiscount?.costReduction ?? 0).toBe(beforeReduction);
  });

  it('right neighbor is empty → no persuadeDiscount change', () => {
    const { state } = makeFixture(null);
    const beforeReduction = state.persuadeDiscount?.costReduction ?? 0;
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: 'rwe-persuade-cost-2',
        choiceText: '永誓低吟',
        effectTokens: ['persuadeLevel+1', 'persuadeCost-2'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.persuadeDiscount?.costReduction ?? 0).toBe(beforeReduction);
  });

  it('event in rightmost slot (no right neighbor) → no persuadeDiscount change', () => {
    const ec = eventCard();
    const monster = monsterCard();
    // 把 event 放到最右，前面填 null 表示空格
    const activeCards: any[] = [null, null, monster, null, ec];
    const state = makeState({
      activeCards: activeCards as any,
      currentEventCard: ec as any,
      resolvingDungeonCardId: ec.id,
    });
    const beforeReduction = state.persuadeDiscount?.costReduction ?? 0;
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: 'rwe-persuade-cost-2',
        choiceText: '永誓低吟',
        effectTokens: ['persuadeLevel+1', 'persuadeCost-2'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.persuadeDiscount?.costReduction ?? 0).toBe(beforeReduction);
  });
});

// ---------------------------------------------------------------------------
// Eligibility (`requires`) — handForKeywordGrant / equippedForOnEquipGrant
// ---------------------------------------------------------------------------

describe('「右翼回响」 eligibility requirements', () => {
  it('handForKeywordGrant:topOnRecycleRestore — true when there exists a hand card without it', () => {
    const state = makeState({ handCards: [handMagic('h-1')] });
    const result = evaluateChoiceRequirement(state, {
      type: 'handForKeywordGrant',
      keyword: 'topOnRecycleRestore',
    });
    expect(result.available).toBe(true);
  });

  it('handForKeywordGrant:topOnRecycleRestore — false when ALL hand cards already have topOnRecycleRestore', () => {
    const state = makeState({
      handCards: [
        handMagic('h-1', { topOnRecycleRestore: true }),
        handMagic('h-2', { topOnRecycleRestore: true }),
      ],
    });
    const result = evaluateChoiceRequirement(state, {
      type: 'handForKeywordGrant',
      keyword: 'topOnRecycleRestore',
    });
    expect(result.available).toBe(false);
  });

  it('handForKeywordGrant:onEnterHandEffect — false when ALL hand cards already have onEnterHandEffect', () => {
    const state = makeState({
      handCards: [
        handMagic('h-1', { onEnterHandEffect: 'on-hand-heal-1' as any }),
        handMagic('h-2', { onEnterHandEffect: 'event-grant-onhand-temp-armor-1' as any }),
      ],
    });
    const result = evaluateChoiceRequirement(state, {
      type: 'handForKeywordGrant',
      keyword: 'onEnterHandEffect',
    });
    expect(result.available).toBe(false);
  });

  it('handForKeywordGrant:onEnterHandEffect — true when any hand card lacks the keyword', () => {
    const state = makeState({
      handCards: [
        handMagic('h-1', { onEnterHandEffect: 'on-hand-heal-1' as any }),
        handMagic('h-2'),
      ],
    });
    const result = evaluateChoiceRequirement(state, {
      type: 'handForKeywordGrant',
      keyword: 'onEnterHandEffect',
    });
    expect(result.available).toBe(true);
  });

  it('equippedForOnEquipGrant — true when at least one main slot has equipment without onEquipEffect', () => {
    const state = makeState({
      equipmentSlot1: weapon('w-1') as any,
      equipmentSlot2: null,
    });
    const result = evaluateChoiceRequirement(state, { type: 'equippedForOnEquipGrant' });
    expect(result.available).toBe(true);
  });

  it('equippedForOnEquipGrant — false when ALL main slots have equipment with onEquipEffect', () => {
    const state = makeState({
      equipmentSlot1: weapon('w-1', { onEquipEffect: 'gold+4' as any }) as any,
      equipmentSlot2: shield('s-1', { onEquipEffect: 'persuade-bonus-10' as any }) as any,
    });
    const result = evaluateChoiceRequirement(state, { type: 'equippedForOnEquipGrant' });
    expect(result.available).toBe(false);
  });

  it('equippedForOnEquipGrant — false when both main slots are empty (reserve excluded by design)', () => {
    const state = makeState({
      equipmentSlot1: null,
      equipmentSlot2: null,
      // Reserve doesn't count even if it has eligible items
      equipmentSlot1Reserve: weapon('w-reserve') as any,
    } as any);
    const result = evaluateChoiceRequirement(state, { type: 'equippedForOnEquipGrant' });
    expect(result.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Option 3 (persuadeCost-2) — non-interactive happy path
// ---------------------------------------------------------------------------

describe('「右翼回响」 option 3 — persuadeLevel +1 & permanent persuade cost -2', () => {
  it('drain → persuadeCostModifier -2 AND persuadeLevel +1', () => {
    const ec = eventCard();
    const state = makeState({
      activeCards: [ec, null, null, null, null] as any,
      currentEventCard: ec as any,
      resolvingDungeonCardId: ec.id,
      persuadeCostModifier: 0,
    });
    const beforeCost = state.persuadeCostModifier ?? 0;
    const beforeLevel = state.persuadeLevel ?? 0;
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: 'rwe-persuade-cost-2',
        choiceText: '永誓低吟',
        effectTokens: ['persuadeLevel+1', 'persuadeCost-2'],
        skipFlip: false,
      } as any,
    ]);
    // persuadeCost-2 reduces persuasion cost via persuadeCostModifier (clamped
    // to MIN_PERSUADE_COST). Default state starts well above floor, so we
    // expect a -2 delta.
    expect((final.state.persuadeCostModifier ?? 0) - beforeCost).toBe(-2);
    // persuadeLevel+1 increments persuadeLevel directly.
    expect((final.state.persuadeLevel ?? 0) - beforeLevel).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stay-flip → 装甲铸蚀 magic
// ---------------------------------------------------------------------------

describe('「右翼回响」 stay-flip → 装甲铸蚀 magic', () => {
  it('after option 3 (persuadeCost-2) — event card flips and stays in active cell', () => {
    // Build the real card from the deck so we get the flipTarget config.
    // We bypass deck-construction by using a minimal stub here matching what
    // the deck constructor produces.
    const armorEtch: GameCardData = {
      id: 'evt-rwe-1-flip',
      type: 'magic' as const,
      name: '装甲铸蚀',
      value: 0,
      magicType: 'instant',
      magicEffect: '选择一个装备栏，永久护甲加成 +2。',
    } as any;
    const ec: GameCardData = {
      id: 'evt-rwe-1',
      type: 'event' as const,
      name: '右翼回响',
      value: 0,
      eventChoices: [
        { text: '永誓低吟', effect: ['persuadeLevel+1', 'persuadeCost-2'] },
      ],
      flipTarget: {
        toCard: armorEtch as any,
        destination: 'stay',
        message: '右翼回响翻转为「装甲铸蚀」！',
      } as any,
    };
    const state = makeState({
      activeCards: [ec, null, null, null, null] as any,
      currentEventCard: ec as any,
      resolvingDungeonCardId: ec.id,
    });
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '0',
        choiceText: '永誓低吟',
        effectTokens: ['persuadeLevel+1', 'persuadeCost-2'],
        skipFlip: false,
      } as any,
    ]);
    // After completion, the active cell should hold the flipped magic card
    // (magic with name 装甲铸蚀). Look for the card name in active row.
    const flippedSlot = (final.state.activeCards as any[]).find(
      c => c && c.type === 'magic' && c.name === '装甲铸蚀',
    );
    expect(flippedSlot).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 装甲铸蚀 magic resolver — slot-select → +2 perm shield bonus
// ---------------------------------------------------------------------------

describe('「装甲铸蚀」 magic resolver — slot-select → +2 perm shield bonus', () => {
  function armorEtchCard(): GameCardData {
    return {
      id: 'magic-armor-etch-1',
      type: 'magic' as const,
      name: '装甲铸蚀',
      value: 0,
      magicType: 'instant',
      magicEffect: '选择一个装备栏，永久护甲加成 +2。',
    } as any;
  }

  it('RESOLVE_MAGIC opens slot-select pendingMagicAction', () => {
    const card = armorEtchCard();
    const state = makeState({ handCards: [card] });
    // RESOLVE_MAGIC routes through executeMagicCardEffects → registry lookup
    // (`card:装甲铸蚀` → armorEtchMagic resolver) → opens slot-select pending.
    // (PLAY_CARD enqueues RESOLVE_MAGIC, but we test the magic resolver
    // directly to avoid the full pipeline.)
    const result = reduce(state, {
      type: 'RESOLVE_MAGIC',
      cardId: card.id,
      card,
    } as any);
    const pma = result.state.pendingMagicAction as any;
    expect(pma?.effect).toBe('event-armor-etch');
    expect(pma?.step).toBe('slot-select');
  });

  it('RESOLVE_MAGIC_SLOT_SELECTION with equipmentSlot1 → +2 to slot1.shield bonus', () => {
    const card = armorEtchCard();
    const state = makeState({
      equipmentSlot1: shield('s-1') as any,
      pendingMagicAction: {
        card,
        effect: 'event-armor-etch',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = reduce(state, {
      type: 'RESOLVE_MAGIC_SLOT_SELECTION',
      magicId: 'event-armor-etch',
      slotId: 'equipmentSlot1',
    } as any);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 2);
  });

  it('RESOLVE_MAGIC_SLOT_SELECTION with equipmentSlot2 (empty slot) → +2 to slot2.shield bonus', () => {
    const card = armorEtchCard();
    const state = makeState({
      equipmentSlot2: null,
      pendingMagicAction: {
        card,
        effect: 'event-armor-etch',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot2.shield;
    const result = reduce(state, {
      type: 'RESOLVE_MAGIC_SLOT_SELECTION',
      magicId: 'event-armor-etch',
      slotId: 'equipmentSlot2',
    } as any);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(before + 2);
  });

  it('echoMultiplier=2 — bonus is 2 × 2 = 4', () => {
    const card = armorEtchCard();
    const state = makeState({
      equipmentSlot1: shield('s-1') as any,
      pendingMagicAction: {
        card,
        effect: 'event-armor-etch',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = reduce(state, {
      type: 'RESOLVE_MAGIC_SLOT_SELECTION',
      magicId: 'event-armor-etch',
      slotId: 'equipmentSlot1',
    } as any);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 4);
  });
});

// ---------------------------------------------------------------------------
// `discoverPostInjectTopOnRecycleRestore` plumbing for option 2
// ---------------------------------------------------------------------------

describe('option 2 plumbing — BEGIN_DISCOVER w/ postInjectTopOnRecycleRestore', () => {
  it('BEGIN_DISCOVER stores the flag in state.discoverPostInjectTopOnRecycleRestore', () => {
    const state = makeState();
    const stubPool: GameCardData[] = [
      { id: 'cls-1', type: 'magic' as const, name: 'X', value: 0 } as any,
      { id: 'cls-2', type: 'magic' as const, name: 'Y', value: 0 } as any,
      { id: 'cls-3', type: 'magic' as const, name: 'Z', value: 0 } as any,
    ];
    const result = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'event-grant-discover-class-topped-to-hand',
      pool: stubPool,
      postInjectTopOnRecycleRestore: true,
    } as any);
    expect(result.state.discoverPostInjectTopOnRecycleRestore).toBe(true);
    expect(result.state.discoverModalOpen).toBe(true);
  });

  it('RESOLVE_DISCOVER_SELECTION clones the chosen card with topOnRecycleRestore: true', () => {
    const state = makeState();
    const stubPool: GameCardData[] = [
      { id: 'cls-1', type: 'magic' as const, name: 'X', value: 0 } as any,
    ];
    let after = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'event-grant-discover-class-topped-to-hand',
      pool: stubPool,
      delivery: 'hand-first',
      postInjectTopOnRecycleRestore: true,
    } as any);
    const offered = after.state.discoverOptions[0];
    expect(offered).toBeDefined();
    const result = reduce(after.state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: offered.id,
    } as any);
    // The cloned card should land in handCards (delivery='hand-first') with
    // topOnRecycleRestore=true injected.
    const landed = result.state.handCards.find(c => c.name === 'X');
    expect(landed).toBeDefined();
    expect((landed as any).topOnRecycleRestore).toBe(true);
    // Flag should reset to false after selection.
    expect(result.state.discoverPostInjectTopOnRecycleRestore).toBe(false);
  });

  it('RESOLVE_DISCOVER_SELECTION without the flag does NOT inject topOnRecycleRestore', () => {
    const state = makeState();
    const stubPool: GameCardData[] = [
      { id: 'cls-1', type: 'magic' as const, name: 'X', value: 0 } as any,
    ];
    let after = reduce(state, {
      type: 'BEGIN_DISCOVER',
      source: 'some-other-source',
      pool: stubPool,
      delivery: 'hand-first',
      // postInjectTopOnRecycleRestore omitted → defaults to false
    } as any);
    const offered = after.state.discoverOptions[0];
    const result = reduce(after.state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: offered.id,
    } as any);
    const landed = result.state.handCards.find(c => c.name === 'X');
    expect(landed).toBeDefined();
    expect((landed as any).topOnRecycleRestore).toBeUndefined();
  });
});
