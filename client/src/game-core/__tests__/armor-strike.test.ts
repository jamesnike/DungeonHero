/**
 * 铠甲贯刺 (knight:armor-strike) — Perm 1 magic.
 *
 * On play:
 *   - 0 shields equipped → cancel, no damage.
 *   - 1 shield equipped → auto-pick shield, then **always** open monster-select picker
 *     (single-target damage magic 自伤 path: hero cell 也是合法目标).
 *   - 2 shields equipped → open slot-select pendingMagicAction.
 *
 * Damage formula:
 *   floor(currentArmor * armorPct / 100) + amplifyBonus, then through getSpellDamage.
 *
 * `currentArmor` MUST come from `computeSlotArmorValuePure`, which includes:
 *   - shield's stored armor (current durability of armor pool, capped to armorMax)
 *   - permanent slot shield bonus (`equipmentSlotBonuses[slotId].shield`)
 *   - global defense bonus (`computeDefenseBonusPure` — amulets, Iron Skin, etc.)
 *   - temporary slot armor (`slotTempArmor`)
 *
 * Upgrade level: 0 → 100%, 1 → 150%.
 *
 * Regression: previously the "1 shield + 1 monster" branch in `magic-effects.ts`
 * used raw `shieldSlots[0].item.value`, ignoring permanent slot bonuses. The tests
 * below now exercise the unified picker path (PLAY_CARD → MONSTER_SELECTION) and
 * lock in that the picker's `pendingDamage` correctly comes from `computeSlotArmorValuePure`.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeCard(idSuffix = 'as', upgradeLevel?: number) {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic' as const,
    name: '铠甲贯刺',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent' as const,
    magicEffect: '将护甲值转化为伤害。',
    description: 'test',
    knightEffect: 'armor-strike',
    recycleDelay: 1,
    ...(upgradeLevel !== undefined ? { upgradeLevel } : {}),
  };
}

function makeIronShield(overrides: Record<string, unknown> = {}): EquipmentItem {
  // Iron Shield: value=3 base armor, armorMax=3, full durability.
  return {
    id: 's1',
    type: 'shield' as const,
    name: 'Iron Shield',
    value: 3,
    armorMax: 3,
    armor: 3,
    durability: 3,
    maxDurability: 3,
    ...overrides,
  } as EquipmentItem;
}

function makeMonster(id: string, hp: number) {
  return {
    id,
    type: 'monster' as const,
    name: `M${id}`,
    value: hp,
    hp,
    maxHp: hp,
    attack: 0,
  };
}

function activeRowOf(...monsters: ReturnType<typeof makeMonster>[]): ActiveRowSlots {
  const row: (ReturnType<typeof makeMonster> | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function withSlot1ShieldBonus(bonus: number): Pick<GameState, 'equipmentSlotBonuses'> {
  return {
    equipmentSlotBonuses: {
      equipmentSlot1: { damage: 0, shield: bonus },
      equipmentSlot2: { damage: 0, shield: 0 },
    },
  };
}

describe('铠甲贯刺 (armor-strike) 1-shield path — picker uses computeSlotArmorValuePure', () => {
  it('1 shield + 1 monster: 选中怪物后伤害 = current armor (base + permanent slot bonus)，不是 raw value', () => {
    // The original bug: Iron Shield (value=3) with permanent +4 shows 7 in UI but
    // the auto-pick branch was reading `item.value` and dealing only 3 damage.
    // 现在统一走 picker，所以补一步 RESOLVE_MAGIC_MONSTER_SELECTION。
    const card = makeCard('bug-repro');
    const shield = makeIronShield();
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      ...withSlot1ShieldBonus(4),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.effect).toBe('armor-strike');
    expect((afterPlay.state.pendingMagicAction as any)?.step).toBe('monster-select');
    expect((afterPlay.state.pendingMagicAction as any)?.pendingDamage).toBe(7);

    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    expect(result.state.pendingMagicAction).toBeNull();
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(93);
  });

  it('1 shield + 1 monster: no slot bonus → damage = raw armor (still correct)', () => {
    const card = makeCard('no-bonus');
    const shield = makeIronShield();
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(97);
  });

  it('1 shield + 1 monster, upgrade level 1: 150% × current armor', () => {
    const card = makeCard('upg', 1);
    const shield = makeIronShield();
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
      ...withSlot1ShieldBonus(4),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(90);
  });

  it('1 shield + multi monsters: pendingMagicAction.pendingDamage = current armor (with bonuses)', () => {
    const card = makeCard('multi');
    const shield = makeIronShield();
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 50), makeMonster('m2', 50)),
      ...withSlot1ShieldBonus(4),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending).not.toBeNull();
    expect(pending.effect).toBe('armor-strike');
    expect(pending.step).toBe('monster-select');
    expect(pending.slotId).toBe('equipmentSlot1');
    // pendingDamage = floor(7 × 100 / 100) = 7 — must use computed armor, not raw value(3).
    expect(pending.pendingDamage).toBe(7);
  });

  it('0 shields: cancels, no damage, no pendingMagicAction', () => {
    const card = makeCard('zero');
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      activeCards: activeRowOf(monster),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeNull();
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(100);
  });

  it('2 shields: opens slot-select (no auto-pick)', () => {
    const card = makeCard('two-shields');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeIronShield({ id: 's1' }),
      equipmentSlot2: makeIronShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending).not.toBeNull();
    expect(pending.effect).toBe('armor-strike');
    expect(pending.step).toBe('slot-select');
  });
});

describe('铠甲贯刺 (armor-strike) manual slot-select branch — parity with 1-shield path', () => {
  it('RESOLVE_MAGIC_SLOT_SELECTION + monster-select 同样走 computeSlotArmorValuePure', () => {
    const card = makeCard('manual');
    const shield = makeIronShield();
    const monster = makeMonster('m1', 100);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: shield,
      equipmentSlot2: makeIronShield({ id: 's2' }),
      activeCards: activeRowOf(monster),
      ...withSlot1ShieldBonus(4),
      pendingMagicAction: {
        card,
        effect: 'armor-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    // slot-select 进入 monster-select；现在 monster-select 不再自动命中，必须再 select 一次。
    const afterSlot = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect((afterSlot.state.pendingMagicAction as any)?.step).toBe('monster-select');

    const result = drain(
      afterSlot.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(93);
  });
});
