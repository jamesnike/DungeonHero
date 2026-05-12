/**
 * Shop-bought hero skills — bug coverage tests.
 *
 * 这一轮审计发现 3 个 bug 模式（除前一轮已修的 4 个共享 ID passive 之外）：
 *
 *   Bug A: `early-surge` shop 买 → `initialClassCardDraw: 3` 被丢弃
 *     根因：`shopSelectSkillPure` 把 `classDraw` op 推到 asyncOps[]，但唯一
 *     listener (`useShopHandlers.ts:925`) 只 log 不处理。
 *
 *   Bug B: `vanguard-swap` shop 买 → `initialHandDraw: 2` 被丢弃
 *     根因：同 Bug A，`handDraw` op 同样被丢弃。
 *
 *   Bug C: `shield-wall` shop 买 → 雷霆符印不出现 + 武器装备限制不生效
 *     根因：`runOpeningSetup` 给雷霆符印的代码只检查 `eternalRelics`，
 *     `GameBoard.tsx:7024` 的「不能装备武器」拦截也只查 `eternalRelics`。
 *
 * 修复（per user enforce-and-clear 选择）：
 *   - A/B：`reduceShopSelectSkill` 在 filter 里把 classDraw / handDraw enqueue
 *     成 `DRAW_CLASS_TO_BACKPACK` / `DRAW_CARDS source: 'backpack'` action。
 *   - C：`reduceShopSelectSkill` 检测 skillId === 'shield-wall' 时
 *     1) enqueue `DRAW_CLASS_TO_BACKPACK` includeIds=[thunder seal id]
 *     2) 把所有装备槽（main + reserve）的 weapon 卸到背包
 *     `GameBoard.tsx` 的 weapon-equip 拦截改用 `hasPassiveSkillOrRelic`。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from '../actions';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    hp: 20,
    permanentMaxHpBonus: 30,
    shopSkillSelectOpen: true,
    ...overrides,
  };
}

const thunderSealCard: GameCardData = {
  id: 'class-thunder-seal-template',
  type: 'amulet',
  name: '雷霆符印',
  value: 0,
  amuletEffect: 'discard-zap',
  classCard: true,
} as any;

const dummyClassMagic: GameCardData = {
  id: 'class-dummy-magic',
  type: 'magic',
  name: '示例魔法',
  value: 0,
  magicEffect: 'noop',
  classCard: true,
} as any;

const dummyClassWeapon: GameCardData = {
  id: 'class-dummy-weapon',
  type: 'weapon',
  name: '示例武器',
  value: 3,
  durability: 2,
  maxDurability: 2,
  classCard: true,
} as any;

const dummyClassShield: GameCardData = {
  id: 'class-dummy-shield',
  type: 'shield',
  name: '示例护盾',
  value: 2,
  durability: 2,
  maxDurability: 2,
  classCard: true,
} as any;

// ---------------------------------------------------------------------------
// Bug A: early-surge 先发制人 — initialClassCardDraw: 3
// ---------------------------------------------------------------------------
describe('Bug A: early-surge shop-buy → initialClassCardDraw: 3 should draw 3 class cards', () => {
  it('shop buy early-surge → backpack receives 3 cloned class cards', () => {
    const state = makeState({
      classDeck: [dummyClassMagic, dummyClassWeapon, dummyClassShield] as any,
      backpackItems: [],
      turnCount: 5,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'early-surge' } as GameAction,
    ]);
    // Skill landed in extraHeroSkills
    expect(result.state.extraHeroSkills).toContain('early-surge');
    // turnCount bumped by initialWaterfallBonus: 1
    expect(result.state.turnCount).toBe(6);
    // Backpack got 3 cards (from class deck pool)
    expect(result.state.backpackItems.length).toBe(3);
    // Cards are cloned (fresh ids), not the original templates
    for (const c of result.state.backpackItems) {
      expect(c.id).not.toBe(dummyClassMagic.id);
      expect(c.id).not.toBe(dummyClassWeapon.id);
      expect(c.id).not.toBe(dummyClassShield.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Bug B: vanguard-swap 先锋换阵 — initialHandDraw: 2
// ---------------------------------------------------------------------------
describe('Bug B: vanguard-swap shop-buy → initialHandDraw: 2 should draw 2 hand cards', () => {
  it('shop buy vanguard-swap → 2 cards moved from backpack to hand', () => {
    const card1: GameCardData = { id: 'h1', type: 'magic', name: 'A', value: 0, magicEffect: 'noop' } as any;
    const card2: GameCardData = { id: 'h2', type: 'magic', name: 'B', value: 0, magicEffect: 'noop' } as any;
    const card3: GameCardData = { id: 'h3', type: 'magic', name: 'C', value: 0, magicEffect: 'noop' } as any;
    const state = makeState({
      backpackItems: [card1, card2, card3],
      handCards: [],
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'vanguard-swap' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('vanguard-swap');
    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(1);
  });

  it('shop buy vanguard-swap → empty backpack: hand stays empty (graceful no-op)', () => {
    const state = makeState({
      backpackItems: [],
      handCards: [],
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'vanguard-swap' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('vanguard-swap');
    expect(result.state.handCards.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug C: shield-wall 雷盾心法 — thunder seal + clear weapons
// ---------------------------------------------------------------------------
describe('Bug C: shield-wall shop-buy → grant thunder seal + clear weapons', () => {
  it('shop buy shield-wall with thunder seal in class deck → backpack receives a cloned thunder seal', () => {
    const state = makeState({
      classDeck: [thunderSealCard, dummyClassMagic, dummyClassWeapon] as any,
      backpackItems: [],
      permanentSpellDamageBonus: 0,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'shield-wall' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('shield-wall');
    // +1 spell damage applied
    expect(result.state.permanentSpellDamageBonus).toBe(1);
    // Backpack got the thunder seal
    const sealInBackpack = result.state.backpackItems.find(
      c => c.type === 'amulet' && (c as any).amuletEffect === 'discard-zap',
    );
    expect(sealInBackpack).toBeTruthy();
  });

  it('shop buy shield-wall → equipped weapons in slot1 main are cleared to backpack', () => {
    const equippedWeapon: GameCardData = {
      id: 'eq-w1',
      type: 'weapon',
      name: '装备武器',
      value: 5,
      durability: 2,
      maxDurability: 2,
      fromSlot: 'equipmentSlot1',
    } as any;
    const state = makeState({
      classDeck: [thunderSealCard] as any,
      backpackItems: [],
      equipmentSlot1: equippedWeapon as any,
      equipmentSlot2: null,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'shield-wall' } as GameAction,
    ]);
    expect(result.state.equipmentSlot1).toBeNull();
    // Removed weapon should be back in backpack (or handled as overflow)
    const weaponInBackpack = result.state.backpackItems.find(c => c.id === 'eq-w1');
    expect(weaponInBackpack).toBeTruthy();
    // fromSlot stripped per card-fromslot-bookkeeping rule
    expect((weaponInBackpack as any)?.fromSlot).toBeUndefined();
  });

  it('shop buy shield-wall → shield in slot1 stays equipped (only weapons cleared)', () => {
    const equippedShield: GameCardData = {
      id: 'eq-s1',
      type: 'shield',
      name: '装备护盾',
      value: 3,
      durability: 2,
      maxDurability: 2,
      fromSlot: 'equipmentSlot1',
    } as any;
    const state = makeState({
      classDeck: [thunderSealCard] as any,
      backpackItems: [],
      equipmentSlot1: equippedShield as any,
      equipmentSlot2: null,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'shield-wall' } as GameAction,
    ]);
    expect(result.state.equipmentSlot1?.id).toBe('eq-s1');
    expect(result.state.backpackItems.find(c => c.id === 'eq-s1')).toBeFalsy();
  });

  it('shop buy shield-wall → slot1 has weapon + shield in reserve: shield promotes to main, weapon → backpack', () => {
    const equippedWeapon: GameCardData = {
      id: 'eq-w1',
      type: 'weapon',
      name: '装备武器',
      value: 5,
      durability: 2,
      maxDurability: 2,
      fromSlot: 'equipmentSlot1',
    } as any;
    const reserveShield: GameCardData = {
      id: 'eq-s-reserve',
      type: 'shield',
      name: '后备护盾',
      value: 2,
      durability: 2,
      maxDurability: 2,
      fromSlot: 'equipmentSlot1',
    } as any;
    const state = makeState({
      classDeck: [thunderSealCard] as any,
      backpackItems: [],
      equipmentSlot1: equippedWeapon as any,
      equipmentSlot1Reserve: [reserveShield] as any,
      equipmentSlot2: null,
      equipmentSlotCapacity: { equipmentSlot1: 2, equipmentSlot2: 1 } as any,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'shield-wall' } as GameAction,
    ]);
    // Shield promoted to main
    expect(result.state.equipmentSlot1?.id).toBe('eq-s-reserve');
    expect(result.state.equipmentSlot1Reserve.length).toBe(0);
    // Weapon moved to backpack
    expect(result.state.backpackItems.find(c => c.id === 'eq-w1')).toBeTruthy();
  });

  it('shop buy shield-wall → both slots have weapons: both cleared', () => {
    const w1: GameCardData = {
      id: 'eq-w1', type: 'weapon', name: 'W1', value: 5, durability: 2, maxDurability: 2,
      fromSlot: 'equipmentSlot1',
    } as any;
    const w2: GameCardData = {
      id: 'eq-w2', type: 'weapon', name: 'W2', value: 4, durability: 2, maxDurability: 2,
      fromSlot: 'equipmentSlot2',
    } as any;
    const state = makeState({
      classDeck: [thunderSealCard] as any,
      backpackItems: [],
      equipmentSlot1: w1 as any,
      equipmentSlot2: w2 as any,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'shield-wall' } as GameAction,
    ]);
    expect(result.state.equipmentSlot1).toBeNull();
    expect(result.state.equipmentSlot2).toBeNull();
    expect(result.state.backpackItems.find(c => c.id === 'eq-w1')).toBeTruthy();
    expect(result.state.backpackItems.find(c => c.id === 'eq-w2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Regression: existing inline-handled ops still work after the change
// ---------------------------------------------------------------------------
describe('Regression: pre-existing inline-handled ops still work', () => {
  it('summon-minion shop buy → minion card added to backpack (still works)', () => {
    const state = makeState({
      classDeck: [dummyClassMagic] as any,
      backpackItems: [],
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'summon-minion' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('summon-minion');
    const minion = result.state.backpackItems.find(c => (c as any).isMinionCard);
    expect(minion).toBeTruthy();
    expect(minion?.name).toBe('小随从');
  });

  it('heal-to-damage shop buy → heal-echo card added to backpack (still works)', () => {
    const state = makeState({
      classDeck: [dummyClassMagic] as any,
      backpackItems: [],
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'heal-to-damage' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('heal-to-damage');
    // Heal-echo card was added (the starter heal-echo card)
    expect(result.state.backpackItems.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Regression: shop-buy paths that already worked correctly
// ---------------------------------------------------------------------------
describe('Regression: skills with init bonuses applied via state fields still work', () => {
  it('vitality-well shop buy → +8 max HP via permanentMaxHpBonus, +8 gold', () => {
    const state = makeState({
      gold: 0,
      hp: 20,
      permanentMaxHpBonus: 0,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'vitality-well' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('vitality-well');
    expect(result.state.permanentMaxHpBonus).toBe(8);
    expect(result.state.hp).toBe(28);
    expect(result.state.gold).toBe(8);
  });

  it('blood-draw shop buy → handLimitBonus +1', () => {
    const state = makeState({
      handLimitBonus: 0,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'blood-draw' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('blood-draw');
    expect(result.state.handLimitBonus).toBe(1);
  });

  it('gold-discovery shop buy → backpackCapacityModifier +2', () => {
    const state = makeState({
      backpackCapacityModifier: 0,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'gold-discovery' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('gold-discovery');
    expect(result.state.backpackCapacityModifier).toBe(2);
  });

  it('discard-profit shop buy → shopLevel bumped to 1', () => {
    const state = makeState({
      shopLevel: 0,
    });
    const result = drain(state, [
      { type: 'SHOP_SELECT_SKILL', skillId: 'discard-profit' } as GameAction,
    ]);
    expect(result.state.extraHeroSkills).toContain('discard-profit');
    expect(result.state.shopLevel).toBeGreaterThanOrEqual(1);
  });
});
