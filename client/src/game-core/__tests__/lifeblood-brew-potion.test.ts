/**
 * 血源酿 — 一次性消耗药剂，永久 maxHp +6（cap-only）。
 *
 * 钉死的不变量：
 *   1. createStarterCardPool() 包含 血源酿，type='potion', potionEffect='maxhp+6'，
 *      id=STARTER_CARD_IDS.lifebloodBrewPotion。
 *   2. 卡牌通过 schema engine 走 'potion:maxhp+6' definition（不依赖 legacy switch）。
 *   3. RESOLVE_POTION → state.permanentMaxHpBonus += 6，state.hp 不变（cap-only）。
 *   4. 跟现有 permanentMaxHpBonus 累加（不覆盖）。
 *   5. side effects 包含 log + banner 提示。
 *   6. 多次使用可叠加。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createStarterCardPool, STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    ...overrides,
  };
}

function makePotion(over: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'lifeblood-1',
    type: 'potion',
    name: '血源酿',
    value: 0,
    potionEffect: 'maxhp+6',
    ...over,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// 1) Starter pool 注册
// ---------------------------------------------------------------------------
describe('血源酿 — starter pool registration', () => {
  it('createStarterCardPool() 包含 血源酿 with correct stats', () => {
    const pool = createStarterCardPool();
    const card = pool.find(c => c.id === STARTER_CARD_IDS.lifebloodBrewPotion);
    expect(card).toBeDefined();
    expect(card!.type).toBe('potion');
    expect(card!.name).toBe('血源酿');
    expect((card as any).potionEffect).toBe('maxhp+6');
    // 一次性消耗（非 Perm）：不应有 recycleDelay / permEquipment / magicType=permanent
    expect((card as any).recycleDelay).toBeUndefined();
    expect((card as any).magicType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2) Cap-only 语义（permanentMaxHpBonus +6, current hp 不变）
// ---------------------------------------------------------------------------
describe('血源酿 — cap-only semantics', () => {
  it('basic: permanentMaxHpBonus 0 → 6, current hp unchanged', () => {
    const card = makePotion();
    const state = makeState({
      hp: 20,
      permanentMaxHpBonus: 0,
      handCards: [card],
    });

    const result = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card });

    expect(result.state.permanentMaxHpBonus).toBe(6);
    expect(result.state.hp).toBe(20);
  });

  it('累加在已有 permanentMaxHpBonus 上：5 → 11，hp 不变', () => {
    const card = makePotion({ id: 'lifeblood-stack' });
    const state = makeState({
      hp: 18,
      permanentMaxHpBonus: 5,
      handCards: [card],
    });

    const result = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card });

    expect(result.state.permanentMaxHpBonus).toBe(11);
    expect(result.state.hp).toBe(18);
  });

  it('低血量时也只抬上限，不自动回血到新 maxHp', () => {
    const card = makePotion({ id: 'lifeblood-lowhp' });
    const state = makeState({
      hp: 3,
      permanentMaxHpBonus: 0,
      handCards: [card],
    });

    const result = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card });

    expect(result.state.permanentMaxHpBonus).toBe(6);
    expect(result.state.hp).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3) Side effects: log + banner
// ---------------------------------------------------------------------------
describe('血源酿 — side effects', () => {
  it('emits log entry with card name', () => {
    const card = makePotion({ name: '血源酿' });
    const state = makeState({
      hp: 20,
      permanentMaxHpBonus: 0,
      handCards: [card],
    });

    const result = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card });

    const hasLog = result.sideEffects.some(e =>
      e.event === 'log:entry'
        && (e.payload as any)?.message?.includes('血源酿')
        && (e.payload as any)?.message?.includes('生命值上限'),
    );
    expect(hasLog).toBe(true);
  });

  it('emits banner with maxHp bonus', () => {
    const card = makePotion();
    const state = makeState({
      hp: 20,
      permanentMaxHpBonus: 0,
      handCards: [card],
    });

    const result = reduce(state, { type: 'RESOLVE_POTION', cardId: card.id, card });

    const hasBanner = result.sideEffects.some(e =>
      e.event === 'ui:banner' && (e.payload as any)?.text?.includes('生命值上限 +6'),
    );
    expect(hasBanner).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4) Multiple uses stack
// ---------------------------------------------------------------------------
describe('血源酿 — stacking across multiple uses', () => {
  it('两次使用：permanentMaxHpBonus 0 → 6 → 12，hp 不变', () => {
    const card1 = makePotion({ id: 'lifeblood-1' });
    const card2 = makePotion({ id: 'lifeblood-2' });

    let state: GameState = makeState({
      hp: 20,
      permanentMaxHpBonus: 0,
      handCards: [card1, card2],
    });

    const r1 = reduce(state, { type: 'RESOLVE_POTION', cardId: card1.id, card: card1 });
    expect(r1.state.permanentMaxHpBonus).toBe(6);
    expect(r1.state.hp).toBe(20);

    state = r1.state;
    const r2 = reduce(state, { type: 'RESOLVE_POTION', cardId: card2.id, card: card2 });
    expect(r2.state.permanentMaxHpBonus).toBe(12);
    expect(r2.state.hp).toBe(20);
  });
});
