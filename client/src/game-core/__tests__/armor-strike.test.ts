/**
 * 铠甲贯刺 (knight:armor-strike) — Perm 1 magic.
 *
 * On play:
 *   - 0 shields equipped → cancel, no damage.
 *   - 1 shield equipped, 1 monster → auto-pick shield + auto-target, deal damage immediately.
 *   - 1 shield equipped, multi monsters → auto-pick shield, open monster-select prompt.
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
 * Regression: previously the auto-pick branches in `magic-effects.ts` used the raw
 * `shieldSlots[0].item.value`, ignoring permanent slot bonuses. The tests below
 * lock in the fix so the auto-pick path stays in sync with the manual slot-select
 * path (which has always used `computeSlotArmorValuePure` via `hero.ts`).
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

describe('铠甲贯刺 (armor-strike) auto-pick branch — uses computeSlotArmorValuePure', () => {
  it('1 shield + 1 monster: damage = current armor (base + permanent slot bonus), NOT raw value', () => {
    // The original bug: Iron Shield (value=3) with permanent +4 shows 7 in UI but
    // the auto-pick branch was reading `item.value` and dealing only 3 damage.
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
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.pendingMagicAction).toBeNull();
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    // 100% × 7 = 7 damage → 100 − 7 = 93 hp.
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
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
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
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    // floor(7 × 1.5) = 10 → 100 − 10 = 90 hp.
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

describe('铠甲贯刺 (armor-strike) manual slot-select branch — parity with auto-pick', () => {
  it('RESOLVE_MAGIC_SLOT_SELECTION uses computeSlotArmorValuePure (same as auto-pick)', () => {
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
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    // Same 7 damage as the auto-pick path.
    expect(m?.hp).toBe(93);
  });
});
