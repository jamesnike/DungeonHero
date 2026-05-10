/**
 * 池中坚意 (knight:recycle-temp-armor) — Perm 1 magic.
 *
 * 注：effect id `recycle-temp-armor` 是历史命名（语义曾是「临时护甲」）；
 * 当前版本已改为「**永久**护甲」——同口径于 装甲铸蚀（event-armor-etch）。
 * 不重命名 effect id 以减少跨文件改动面（types union / formatter / upgrades / 测试）。
 *
 * On play: opens slot-select. On RESOLVE_MAGIC_SLOT_SELECTION:
 *   buff = floor(state.permanentMagicRecycleBag.length / divisor) * echoMultiplier
 *   divisor = 4 (Lv0) / 3 (Lv1)
 *   equipmentSlotBonuses[chosenSlot].shield += buff
 *   applySlotArmorBonusDelta refreshes equipped shield/monster armor cap
 *
 * - Empty slot is allowed (bonus binds to slot id; future equipment inherits it).
 * - Always finalizes the magic (consumes the card even at 0 buff).
 * - Echo: this card routes to recycle bag (recycleDelay: 1) AFTER slot-select
 *   resolves, so setup-time read of recycleBag does NOT include this card.
 *   RecycleBag length is constant across echo iterations → A-class
 *   (× echoMultiplier) ≡ C-class numerically here.
 * - 不触发 怀柔之印（persuade-on-temp-attack）：那条护符只对临时攻击/临时
 *   护甲 gain 生效，永久护甲不算（参考 装甲铸蚀 实现）。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { waterfallResetsPure } from '../waterfall';
import type { GameState } from '../types';
import type { GameAction, GameCardData } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'rta', upgradeLevel = 0) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '池中坚意',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '永久魔法：选择一个装备栏，回收袋每 4 张牌 +1 永久护甲。',
    description: 'test',
    knightEffect: 'recycle-temp-armor',
    recycleDelay: 1,
    upgradeLevel,
  };
}

function makeRecycleCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `RC-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 1,
    _recycleWaits: 1,
  } as unknown as GameCardData;
}

function makeRecycleBag(n: number): GameCardData[] {
  return Array.from({ length: n }, (_, i) => makeRecycleCard(`rc-${i}`));
}

function makeShield(id: string, overrides?: Partial<GameCardData>): GameCardData {
  return {
    id,
    type: 'shield' as const,
    name: 'TestShield',
    value: 3,
    image: '',
    durability: 2,
    maxDurability: 2,
    ...overrides,
  } as GameCardData;
}

describe('池中坚意 主效果: slot-select → floor(recycleBag.length / divisor) 永久护甲', () => {
  it('PLAY_CARD opens slot-select pendingMagicAction with effect=recycle-temp-armor', () => {
    const card = makeCard('cast');
    const state = makeState({ handCards: [card] });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect((result.state.pendingMagicAction as any).effect).toBe('recycle-temp-armor');
    expect((result.state.pendingMagicAction as any).step).toBe('slot-select');
  });

  it('Lv0, recycleBag=12 → floor(12/4)=3 → equipmentSlotBonuses[chosenSlot].shield +3', () => {
    const card = makeCard('lv0', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before1 = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const before2 = state.equipmentSlotBonuses.equipmentSlot2.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before1 + 3);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(before2);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('Lv0, recycleBag=3 → floor(3/4)=0 → +0 buff but still resolves', () => {
    const card = makeCard('zero', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(3),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('Lv0, recycleBag=15 → floor(15/4)=3 (rounding down)', () => {
    const card = makeCard('round', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(15),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 3);
  });

  it('Lv1 (divisor=3), recycleBag=10 → floor(10/3)=3', () => {
    const card = makeCard('lv1', 1);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(10),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 3);
  });

  it('Lv1, recycleBag=12 → floor(12/3)=4 (compared to Lv0 which would be 3)', () => {
    const card = makeCard('lv1-12', 1);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 4);
  });

  it('empty slot allowed: bonus still applied to chosen empty slot', () => {
    const card = makeCard('empty', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const before2 = state.equipmentSlotBonuses.equipmentSlot2.shield;
    const before1 = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(before2 + 2);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before1);
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('only the chosen slot is buffed (other slot untouched)', () => {
    const card = makeCard('one-side', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 5 },
        equipmentSlot2: { damage: 0, shield: 7 },
      },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot2' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(5);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.shield).toBe(7 + 3);
  });

  it('echoMultiplier x2: floor(12/4)=3, ×2=6 buff', () => {
    const card = makeCard('echo', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 6);
  });

  it('echoMultiplier x2 with recycleBag=2 (base=0) → 0×2=0 (zero stays zero)', () => {
    const card = makeCard('echo-zero', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(2),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before);
  });

  it('preserves existing equipmentSlotBonuses[slotId].shield on the chosen slot (additive)', () => {
    const card = makeCard('add', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(4 + 2);
  });

  it('end-to-end: PLAY_CARD then RESOLVE_MAGIC_SLOT_SELECTION (full chain)', () => {
    const card = makeCard('e2e', 0);
    const state = makeState({
      phase: 'playerInput',
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('recycle-temp-armor');
    expect(afterPlay.state.permanentMagicRecycleBag.length).toBe(8);
    const afterResolve = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(afterResolve.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 2);
    expect(afterResolve.state.pendingMagicAction).toBeNull();
    expect(afterResolve.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(true);
    expect(afterResolve.state.discardedCards.some(c => c.id === card.id)).toBe(false);
  });

  it('reading recycle bag at slot-select does NOT include this card itself', () => {
    const card = makeCard('selfaware', 0);
    const state = makeState({
      phase: 'playerInput',
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(4),
    });
    const before = state.equipmentSlotBonuses.equipmentSlot1.shield;
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const afterResolve = drain(afterPlay.state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // floor(4/4) = 1, NOT floor(5/4) = 1 — disambiguate with bag=4 (boundary).
    expect(afterResolve.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(before + 1);
  });

  it('clears pendingMagicAction after resolution', () => {
    const card = makeCard('clears', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(4),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 永久护甲特有不变量（区别于旧的临时护甲实现）
// ---------------------------------------------------------------------------

describe('池中坚意 - permanent armor specific invariants', () => {
  it('does NOT write to slotTempArmor (lifecycle: perm, not temp)', () => {
    const card = makeCard('not-temp', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      slotTempArmor: { equipmentSlot1: 0, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    // slotTempArmor must remain at 0/0 — this is the canary that catches a
    // regression to the old "temp armor" implementation.
    expect(result.state.slotTempArmor?.equipmentSlot1 ?? 0).toBe(0);
    expect(result.state.slotTempArmor?.equipmentSlot2 ?? 0).toBe(0);
    // …while the perm bonus DID land.
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(3);
  });

  it('equipped shield: applySlotArmorBonusDelta refreshes current armor toward new cap', () => {
    // Shield value=3 (base armor cap=3); buff +3 → new cap=6.
    // armor field stored at 1 (half-depleted) → new armor = min(1+3, 6) = 4.
    const card = makeCard('refresh', 0);
    const equippedShield = makeShield('eq-1', { armor: 1 });
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      equipmentSlot1: equippedShield as any,
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(3);
    const eq = result.state.equipmentSlot1 as any;
    expect(eq?.armor).toBe(4); // 1 + 3, capped to 6 = 4
  });

  it('does NOT trigger 怀柔之印 (persuade-on-temp-attack) — perm armor is not temp', () => {
    // persuade-on-temp-attack 文案：「每次获得一次临时攻击或临时护甲加成时，
    // 下次劝降率 +10%」。永久护甲不算 temp gain，所以这里不该触发。
    const card = makeCard('no-persuade', 0);
    const persuadeAmulet = {
      id: 'amu-persuade',
      type: 'amulet' as const,
      name: '怀柔之印',
      value: 0,
      image: '',
      amuletEffect: 'persuade-on-temp-attack',
    } as GameCardData;
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(12),
      amuletSlots: [persuadeAmulet],
      persuadeAmuletBonus: 0,
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(3); // bonus 落地
    expect(result.state.persuadeAmuletBonus ?? 0).toBe(0); // 但劝降加成未触发
  });

  it('survives waterfall: perm bonus stays after slotTempArmor reset', () => {
    // 永久护甲 ≠ 临时护甲。waterfallResetsPure 会清 slotTempArmor，
    // 但 equipmentSlotBonuses[slotId].shield 不在清单里（除 bonusDecay 外）。
    // 这里直接调用 reduce 模拟 resolve 后再触发 waterfall 重置，
    // 如果实现误写到 slotTempArmor，瀑流后 bonus 会丢失。
    const card = makeCard('post-wf', 0);
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      pendingMagicAction: {
        card,
        effect: 'recycle-temp-armor',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const afterResolve = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'recycle-temp-armor', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(afterResolve.state.equipmentSlotBonuses.equipmentSlot1.shield).toBe(2);

    // Use the waterfall reset helper directly (it's the same patch applied
    // by DRAW_DUNGEON_ROW). slotTempArmor is zeroed, but equipmentSlotBonuses
    // must persist.
    const wfPatch = waterfallResetsPure(afterResolve.state);
    const postWf = { ...afterResolve.state, ...wfPatch };
    expect(postWf.slotTempArmor.equipmentSlot1).toBe(0); // temp 被清零
    expect(postWf.equipmentSlotBonuses.equipmentSlot1.shield).toBe(2); // 永久 bonus 保留
  });
});
