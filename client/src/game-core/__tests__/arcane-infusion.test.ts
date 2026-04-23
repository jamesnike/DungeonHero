import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makePotion() {
  return {
    id: 'potion-arcane-infusion-test',
    type: 'potion' as const,
    name: '奥术灌注',
    value: 0,
    image: '',
    classCard: true,
    potionEffect: 'dice-arcane-infusion' as const,
  };
}

// 奥术灌注 D20:
//   1-7  (35%) → 翻倍左装备栏永久攻击 + 永久护甲（equipmentSlotBonuses.equipmentSlot1）
//   8-14 (35%) → 翻倍右装备栏永久攻击 + 永久护甲（equipmentSlotBonuses.equipmentSlot2）
//   15-20(30%) → 翻倍永久法术伤害 + 超杀吸血（permanentSpellDamageBonus / permanentSpellLifesteal）
describe('奥术灌注 (dice-arcane-infusion) D20 翻倍流程', () => {
  it('掷骰 1-7 → 翻倍左装备栏永久攻击与永久护甲', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 4 },
        equipmentSlot2: { damage: 5, shield: 6 },
      },
      permanentSpellDamageBonus: 2,
      permanentSpellLifesteal: 1,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const dice = r1.sideEffects.find(s => s.event === ('ui:requestDice' as any));
    expect(dice).toBeDefined();
    const ctx = (dice as any).payload.flowContext;
    expect(ctx.flowId).toBe('arcane-infusion');

    const r2 = drain(r1.state, [
      { type: 'RESOLVE_DICE', value: 5, outcomeId: 'ai-left', context: { ...ctx } } as GameAction,
    ]);

    const b = r2.state.equipmentSlotBonuses;
    expect(b.equipmentSlot1).toEqual({ damage: 6, shield: 8 });
    // 右栏不变
    expect(b.equipmentSlot2).toEqual({ damage: 5, shield: 6 });
    // 法术伤害与超杀吸血不变
    expect(r2.state.permanentSpellDamageBonus).toBe(2);
    expect(r2.state.permanentSpellLifesteal).toBe(1);

    // 卡进坟场（FINALIZE_POTION_CARD 已 enqueue）
    expect(r2.state.handCards.find(c => c?.id === card.id)).toBeUndefined();
    expect(r2.state.discardedCards.find(c => c?.id === card.id)).toBeDefined();
  });

  it('掷骰 8-14 → 翻倍右装备栏永久攻击与永久护甲', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 4 },
        equipmentSlot2: { damage: 5, shield: 6 },
      },
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const ctx = (r1.sideEffects.find(s => s.event === ('ui:requestDice' as any)) as any).payload.flowContext;

    const r2 = drain(r1.state, [
      { type: 'RESOLVE_DICE', value: 10, outcomeId: 'ai-right', context: { ...ctx } } as GameAction,
    ]);

    const b = r2.state.equipmentSlotBonuses;
    expect(b.equipmentSlot1).toEqual({ damage: 3, shield: 4 });
    expect(b.equipmentSlot2).toEqual({ damage: 10, shield: 12 });
  });

  it('掷骰 15-20 → 翻倍永久法术伤害与超杀吸血', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 4 },
        equipmentSlot2: { damage: 5, shield: 6 },
      },
      permanentSpellDamageBonus: 2,
      permanentSpellLifesteal: 3,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const ctx = (r1.sideEffects.find(s => s.event === ('ui:requestDice' as any)) as any).payload.flowContext;

    const r2 = drain(r1.state, [
      { type: 'RESOLVE_DICE', value: 17, outcomeId: 'ai-spell', context: { ...ctx } } as GameAction,
    ]);

    expect(r2.state.permanentSpellDamageBonus).toBe(4);
    expect(r2.state.permanentSpellLifesteal).toBe(6);
    // 装备栏不变
    const b = r2.state.equipmentSlotBonuses;
    expect(b.equipmentSlot1).toEqual({ damage: 3, shield: 4 });
    expect(b.equipmentSlot2).toEqual({ damage: 5, shield: 6 });
  });

  it('永久加成为 0 时静默通过：0×2=0，无变化', () => {
    const card = makePotion();
    const state = makeState({
      handCards: [card] as any,
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 0 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      permanentSpellDamageBonus: 0,
      permanentSpellLifesteal: 0,
    });

    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const ctx = (r1.sideEffects.find(s => s.event === ('ui:requestDice' as any)) as any).payload.flowContext;

    const r2 = drain(r1.state, [
      { type: 'RESOLVE_DICE', value: 1, outcomeId: 'ai-left', context: { ...ctx } } as GameAction,
    ]);
    expect(r2.state.equipmentSlotBonuses.equipmentSlot1).toEqual({ damage: 0, shield: 0 });
    // 卡仍然消耗
    expect(r2.state.discardedCards.find(c => c?.id === card.id)).toBeDefined();
  });

  it('Dice 配置：3 项 entries 覆盖 1-20 且总和为 100% (35/35/30)', () => {
    const card = makePotion();
    const state = makeState({ handCards: [card] as any });
    const r1 = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const dice = r1.sideEffects.find(s => s.event === ('ui:requestDice' as any));
    expect(dice).toBeDefined();
    const entries = (dice as any).payload.entries as Array<{ id: string; range: [number, number] }>;
    expect(entries).toHaveLength(3);
    expect(entries[0].id).toBe('ai-left');
    expect(entries[0].range).toEqual([1, 7]);
    expect(entries[1].id).toBe('ai-right');
    expect(entries[1].range).toEqual([8, 14]);
    expect(entries[2].id).toBe('ai-spell');
    expect(entries[2].range).toEqual([15, 20]);
  });
});
