/**
 * 智者圣盾 (knight:scholar-shield)
 *
 * 4 护甲 / 2 耐久。两条主路径都「从背包抽 N 张牌」：
 *   - 入场（onEquipEffect: 'draw-N'）→ equipment.ts 的 `draw-2` / `draw-3` handler
 *     enqueue `DRAW_CARDS source: 'backpack'`。
 *   - 遗言（onDestroyDraw: N）→ equipment-effects.ts 既有 onDestroyDraw 累加路径
 *     →  cards.ts 在 break / displacement 处理后 enqueue `DRAW_CARDS source: 'backpack'`。
 *
 * 这条规则覆盖：shared-effect-id-impact-check（PLAY_CARD + EQUIP_FROM_HAND 两条
 * 装备路径都验证），draw-cards-defaults-to-backpack（不允许 source: 'deck'）。
 *
 * 升级 L1：onEquipEffect → 'draw-3'，onDestroyDraw → 3，护甲 / 耐久 / 名字 / 路由不变。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import { createInitialGameState } from '../state';
import { createEmptyAmuletEffects, initialCombatState } from '../constants';
import { executeOnUpgrade } from '../card-schema/on-upgrade';
import { computeCardText } from '../card-schema/card-text';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

// Mirror cardUpgrade.ts:applyUpgrade(): bump level, run on-upgrade handler, then
// refresh derived text via the registered formatter (unhandled cards still get
// their text from card-text registry).
function applyUpgrade(card: GameCardData, newLevel: number): GameCardData {
  const upgraded: GameCardData = { ...card, upgradeLevel: newLevel };
  executeOnUpgrade(upgraded, newLevel, createInitialGameState());
  const text = computeCardText(upgraded, createInitialGameState());
  if (text) {
    if (text.description !== undefined) upgraded.description = text.description;
    if (text.shortDescription !== undefined) upgraded.shortDescription = text.shortDescription;
    if (text.magicEffect !== undefined) upgraded.magicEffect = text.magicEffect;
  }
  return upgraded;
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

function makeShield(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 's-scholar',
    type: 'shield',
    name: '智者圣盾',
    value: 4,
    image: '',
    durability: 2,
    maxDurability: 2,
    armorMax: 4,
    onEquipEffect: 'draw-2',
    onDestroyDraw: 2,
    knightEffect: 'scholar-shield',
    classCard: true,
    maxUpgradeLevel: 1,
    upgradeLevel: 0,
  } as GameCardData;
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `bp-${id}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) Knight class deck includes 智者圣盾 with the expected fields
// ---------------------------------------------------------------------------

describe('knight class deck: 智者圣盾 entry', () => {
  it('appears in generateKnightDeck with 4 armor / 2 durability / draw-2 入场 / onDestroyDraw 2 遗言', () => {
    const [deck] = generateKnightDeck(createRng(7));
    const card = deck.find(c => c.name === '智者圣盾');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.value).toBe(4);
    expect((card as any)?.armorMax).toBe(4);
    expect(card?.durability).toBe(2);
    expect(card?.maxDurability).toBe(2);
    expect(card?.onEquipEffect).toBe('draw-2');
    expect((card as any)?.onDestroyDraw).toBe(2);
    expect((card as any)?.knightEffect).toBe('scholar-shield');
    expect(card?.classCard).toBe(true);
    expect((card as any)?.maxUpgradeLevel).toBe(1);
    // unique 不开（默认 undefined）
    expect((card as any)?.unique).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2) On-equip path — PLAY_CARD (点击出牌)
//
// 验证：从手牌点击装备时，PLAY_CARD reducer 走 weapon/shield 分支 →
// executeOnEquip → 'draw-2' handler enqueue DRAW_CARDS source=backpack 2。
// drain 后背包中 2 张牌真的进了手牌。
// ---------------------------------------------------------------------------

describe('智者圣盾 入场 — PLAY_CARD 路径', () => {
  it('点击出牌：从背包抽 2 张牌进手牌', () => {
    const shield = makeShield();
    const bp1 = makeBackpackCard('bp-1');
    const bp2 = makeBackpackCard('bp-2');
    const bp3 = makeBackpackCard('bp-3');

    let state = makeState({
      handCards: [shield],
      backpackItems: [bp1, bp2, bp3],
      equipmentSlot1: null,
      equipmentSlot2: null,
      phase: 'playerInput',
    });

    const r = reduce(state, { type: 'PLAY_CARD', cardId: shield.id });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    // 装到了 slot1（第一个空槽），fromSlot 标对
    expect(state.equipmentSlot1?.id).toBe(shield.id);
    expect((state.equipmentSlot1 as any)?.fromSlot).toBe('equipmentSlot1');

    // 手牌净增加 2 张（出牌时 -1 shield，再 +2 抽牌 = +1 净）
    expect(state.handCards.length).toBe(2);
    // 背包剩 1 张（3 - 2 = 1）
    expect(state.backpackItems.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3) On-equip path — EQUIP_FROM_HAND (拖动到槽)
//
// 这条路径单独 reducer：reduceEquipFromHand。也走 executeOnEquip。
// 历史上「赏金之剑 / 足锡冲锋」的 on-equip 因为只测 PLAY_CARD 漏过 drag 路径
// (shared-effect-id-impact-check 规则记录的事故)。这条 case 防止智者圣盾重蹈覆辙。
// ---------------------------------------------------------------------------

describe('智者圣盾 入场 — EQUIP_FROM_HAND 路径', () => {
  it('拖到装备栏：同样从背包抽 2 张牌进手牌', () => {
    const shield = makeShield({ id: 's-scholar-drag' });
    const bp1 = makeBackpackCard('bp-d1');
    const bp2 = makeBackpackCard('bp-d2');
    const bp3 = makeBackpackCard('bp-d3');

    let state = makeState({
      handCards: [shield],
      backpackItems: [bp1, bp2, bp3],
      equipmentSlot1: null,
      phase: 'playerInput',
    });

    const r = reduce(state, {
      type: 'EQUIP_FROM_HAND',
      card: shield,
      slotId: 'equipmentSlot1',
    });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    // EQUIP_FROM_HAND 只跑 on-equip / equip-empower / amulet-cap progress；
    // 槽位写入与手牌剔除分别在 SET_EQUIPMENT_SLOT / UPDATE_HAND_CARDS 里
    // （由 useCardOperations 编排），所以这里只断言抽牌 side effect 真的发生：
    // 手牌长度从 1（shield）→ 3（shield + 2 张抽出 backpack 牌），背包 3 → 1。
    expect(state.handCards.length).toBe(3);
    expect(state.handCards.some(c => c.id === shield.id)).toBe(true);
    const drawnFromBp = state.handCards.filter(c => c.id !== shield.id).map(c => c.id);
    expect(drawnFromBp.every(id => ['bp-d1', 'bp-d2', 'bp-d3'].includes(id))).toBe(true);
    expect(drawnFromBp.length).toBe(2);
    expect(state.backpackItems.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4) Last-words path — computeEquipmentBreakEffects
//
// 验证：装备耐久归零时，applyOneEquipmentLastWordsIteration 累加
// drawFromBackpack += 2，由 cards.ts 调用方 enqueue DRAW_CARDS。
// 这里直接断言 helper 返回的 drawFromBackpack === 2，与 sacrifice-equipment-last-words
// 测试的「守护之盾 (onDestroyDraw:2)」同一条路径。
// ---------------------------------------------------------------------------

describe('智者圣盾 遗言 — computeEquipmentBreakEffects 路径', () => {
  it('销毁时报 drawFromBackpack === 2 + 遗言 banner', () => {
    const shield = makeShield({ durability: 0 });
    const state = makeState({
      equipmentSlot1: shield as any,
      backpackItems: [makeBackpackCard('grave-1'), makeBackpackCard('grave-2')],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      shield as any,
      createEmptyAmuletEffects(),
    );

    expect(result.drawFromBackpack).toBe(2);
    expect(result.destroyed).toBe(true);
    // broken self 进坟场（per equipment-break-routes-to-grave 规则）
    expect((result.patch.discardedCards ?? []).some(c => c.id === shield.id)).toBe(true);
    // 遗言 banner 触发
    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('遗言触发'),
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5) Upgrade L0 → L1 routing
//
// onEquipEffect 'draw-2' → 'draw-3'，onDestroyDraw 2 → 3，
// 护甲 / 耐久 / 名字 / knightEffect 不变。description / shortDescription 由
// card-text formatter 同步刷新。
// ---------------------------------------------------------------------------

describe('智者圣盾 升级 L0 → L1', () => {
  it('onEquipEffect/draw 量同步 +1，护甲/耐久/路由不变', () => {
    const card = makeShield();
    const upgraded = applyUpgrade(card, 1);
    expect(upgraded.upgradeLevel).toBe(1);
    expect((upgraded as any).onEquipEffect).toBe('draw-3');
    expect((upgraded as any).onDestroyDraw).toBe(3);
    // 护甲 / 耐久 / 路由不变
    expect(upgraded.value).toBe(4);
    expect((upgraded as any).armorMax).toBe(4);
    expect(upgraded.durability).toBe(2);
    expect(upgraded.maxDurability).toBe(2);
    expect((upgraded as any).knightEffect).toBe('scholar-shield');
    // 描述 / 简述刷新
    expect(upgraded.description).toBe('入场：从背包抽 3 张牌。遗言：从背包抽 3 张牌。');
    expect(upgraded.shortDescription).toBe('入场抽 3 张；遗言抽 3 张');
  });

  it('L1 装备入场抽 3 张牌（PLAY_CARD 路径端到端）', () => {
    const card = makeShield();
    const upgraded = applyUpgrade(card, 1);
    const bp1 = makeBackpackCard('u-bp-1');
    const bp2 = makeBackpackCard('u-bp-2');
    const bp3 = makeBackpackCard('u-bp-3');
    const bp4 = makeBackpackCard('u-bp-4');

    let state = makeState({
      handCards: [upgraded],
      backpackItems: [bp1, bp2, bp3, bp4],
      equipmentSlot1: null,
      phase: 'playerInput',
    });

    const r = reduce(state, { type: 'PLAY_CARD', cardId: upgraded.id });
    state = drain(r.state, r.enqueuedActions ?? []).state;

    expect(state.equipmentSlot1?.id).toBe(upgraded.id);
    // 手牌净 +2（-1 shield + 3 抽 = 0 + 3 = 3）。
    expect(state.handCards.length).toBe(3);
    expect(state.backpackItems.length).toBe(1);
  });

  it('L1 遗言报 drawFromBackpack === 3', () => {
    const card = makeShield({ durability: 0 });
    const upgraded = applyUpgrade(card, 1);
    const state = makeState({ equipmentSlot1: upgraded as any });
    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      upgraded as any,
      createEmptyAmuletEffects(),
    );
    expect(result.drawFromBackpack).toBe(3);
  });
});
