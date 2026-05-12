/**
 * Knight 专属 Magic 升级 — 5 张卡 × 多 consumer 路径覆盖
 *
 * 验证矩阵（per `shared-effect-id-impact-check.mdc`：每张卡的所有 consumer 路径都要测）：
 *
 *   铠甲贯刺 (armor-strike):
 *     - 路径 A (handler，仅描述): upgrades.ts armorStrike
 *     - 路径 B (auto-pick, 1 shield): magic-effects.ts:executeKnightMagic case 'armor-strike' (armorPcts table)
 *     - 路径 C (slot-select, 2 shields): hero.ts case 'armor-strike' slot-select (armorPcts table)
 *
 *   残血终焉 (missing-hp-smite):
 *     - 路径 A (handler，仅描述): upgrades.ts missingHpSmite
 *     - 路径 B (display): helpers.ts computeDamageMagicDisplayPure (smitePcts table)
 *     - 路径 C (target resolution): hero.ts case 'missing-hp-smite' (smitePcts table)
 *
 *   坟火新星 (grave-nova):
 *     - 路径 A (handler，仅描述): upgrades.ts graveNova
 *     - 路径 B (display): helpers.ts computeDamageMagicDisplayPure
 *     - 路径 C (reducer): rules/cards.ts reduceTriggerGraveNova (baseDamages table)
 *     - 路径 D (multi-hit): L2 reducer 自递归 enqueue 第 2 击，确保两次伤害独立结算
 *
 *   淬炼冲击 (overkill-upgrade):
 *     - 路径 A (handler，仅描述): upgrades.ts overkillUpgrade
 *     - 路径 B (display): helpers.ts computeDamageMagicDisplayPure
 *     - 路径 C (resolveOverkill): magic-effects.ts resolveOverkillUpgrade (initial prompt)
 *     - 路径 D (target resolve + overkill modal): hero.ts case 'overkill-upgrade'
 *       (L2 时 SET_UPGRADE_MODAL_OPEN.maxCount = 2)
 *
 *   锋刃侧击 (temp-attack-strike):
 *     - 路径 A (handler，更新 description / shortDescription / magicEffect / flankEffect)
 *     - 路径 B (stun rate): hero.ts case 'temp-attack-strike' tasStunPcts table
 *
 * Damage / 比例 表：
 *   - armor-strike:        L0 = 100%, L1 = 125%, L2 = 150%   (maxUpgradeLevel = 2)
 *   - missing-hp-smite:    L0 =  50%, L1 =  75%, L2 = 100%   (maxUpgradeLevel = 2)
 *   - grave-nova:          L0 =   3,  L1 =   5,  L2 =  3 ×2  (maxUpgradeLevel = 2)
 *   - overkill-upgrade:    L0 =   3,  L1 =   5,  L2 =   5    (maxUpgradeLevel = 2)
 *                          升级数量: L0 = 1, L1 = 1, L2 = 2
 *   - temp-attack-strike:  L0 =  20%, L1 =  40%, L2 =  60%   (maxUpgradeLevel = 2)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resolveUpgradeEffectId } from '../card-schema';
import { computeDamageMagicDisplayPure } from '../helpers';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...(overrides ?? {}) };
}

function makeIronShield(overrides: Record<string, unknown> = {}): EquipmentItem {
  return {
    id: 's1',
    type: 'shield' as const,
    name: 'Iron Shield',
    value: 3,
    armorMax: 3,
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

// ---------------------------------------------------------------------------
// 铠甲贯刺 (armor-strike)
// ---------------------------------------------------------------------------

describe('铠甲贯刺 (armor-strike) — routing', () => {
  it('routes to knight:armor-strike via knightEffect field', () => {
    const card: GameCardData = {
      id: 'knight-armor-strike-1',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      knightEffect: 'armor-strike',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:armor-strike');
  });
});

describe('铠甲贯刺 (armor-strike) — handler description updates', () => {
  function armorStrikeL0(): GameCardData {
    return {
      id: 'knight-armor-strike-handler',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：选择一件护甲装备，对目标怪物造成等同护甲值 100% 的伤害。',
      shortDescription: '一件护甲值 100% 转化为伤害',
      magicEffect: '护甲值 100% 转化为伤害。',
      knightEffect: 'armor-strike',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: description / shortDescription / magicEffect 全部从 100% 改为 125%', () => {
    const card = armorStrikeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('护甲值 125%');
    expect(upgraded.shortDescription).toContain('125%');
    expect(upgraded.magicEffect).toContain('125%');
  });

  it('L1 → L2: description / shortDescription / magicEffect 改为 150%', () => {
    const card = { ...armorStrikeL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('护甲值 150%');
    expect(upgraded.shortDescription).toContain('150%');
    expect(upgraded.magicEffect).toContain('150%');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...armorStrikeL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('铠甲贯刺 (armor-strike) — auto-pick (1 shield) damage path', () => {
  // armor = 3 (Iron Shield base) + 4 (slot bonus) = 7

  it('L0: 100% × 7 = 7 damage', () => {
    const card: GameCardData = {
      id: 'as-l0',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-strike',
      recycleDelay: 1,
    } as any;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeIronShield(),
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 100)),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.pendingDamage).toBe(7);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(93);
  });

  it('L1: 125% × 7 → floor 8 damage', () => {
    const card: GameCardData = {
      id: 'as-l1',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-strike',
      recycleDelay: 1,
      upgradeLevel: 1,
    } as any;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeIronShield(),
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 100)),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.pendingDamage).toBe(8);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(92);
  });

  it('L2: 150% × 7 → floor 10 damage', () => {
    const card: GameCardData = {
      id: 'as-l2',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-strike',
      recycleDelay: 1,
      upgradeLevel: 2,
    } as any;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeIronShield(),
      equipmentSlot2: null,
      activeCards: activeRowOf(makeMonster('m1', 100)),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect((afterPlay.state.pendingMagicAction as any)?.pendingDamage).toBe(10);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(90);
  });
});

describe('铠甲贯刺 (armor-strike) — slot-select (2 shields) damage path', () => {
  // armor of equipmentSlot1 = 3 (base) + 4 (bonus) = 7

  it('L1: RESOLVE_MAGIC_SLOT_SELECTION → monster-select, damage = 125% × 7 → 8', () => {
    const card: GameCardData = {
      id: 'as-slot-l1',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-strike',
      recycleDelay: 1,
      upgradeLevel: 1,
    } as any;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeIronShield(),
      equipmentSlot2: makeIronShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 100)),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      pendingMagicAction: {
        card,
        effect: 'armor-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const afterSlot = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect((afterSlot.state.pendingMagicAction as any)?.pendingDamage).toBe(8);
    const result = drain(
      afterSlot.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(92);
  });

  it('L2: slot-select 路径 damage = 150% × 7 → 10', () => {
    const card: GameCardData = {
      id: 'as-slot-l2',
      type: 'magic',
      name: '铠甲贯刺',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'armor-strike',
      recycleDelay: 1,
      upgradeLevel: 2,
    } as any;
    const state = makeState({
      handCards: [card],
      equipmentSlot1: makeIronShield(),
      equipmentSlot2: makeIronShield({ id: 's2' }),
      activeCards: activeRowOf(makeMonster('m1', 100)),
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 0, shield: 4 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      pendingMagicAction: {
        card,
        effect: 'armor-strike',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const afterSlot = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'armor-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect((afterSlot.state.pendingMagicAction as any)?.pendingDamage).toBe(10);
    const result = drain(
      afterSlot.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'armor-strike', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// 残血终焉 (missing-hp-smite)
// ---------------------------------------------------------------------------

describe('残血终焉 (missing-hp-smite) — routing', () => {
  it('routes to knight:missing-hp-smite via knightEffect field', () => {
    const card: GameCardData = {
      id: 'knight-mhs-1',
      type: 'magic',
      name: '残血终焉',
      value: 0,
      knightEffect: 'missing-hp-smite',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:missing-hp-smite');
  });
});

describe('残血终焉 (missing-hp-smite) — handler description updates', () => {
  function missingHpSmiteL0(): GameCardData {
    return {
      id: 'knight-mhs-handler',
      type: 'magic',
      name: '残血终焉',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：对一名怪物造成等同当前已损失生命值 50% 的伤害。',
      shortDescription: '伤害 ＝ 已损失生命 50%',
      magicEffect: '以失去生命 50% 为伤害。',
      knightEffect: 'missing-hp-smite',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: description / magicEffect 50% → 75%', () => {
    const card = missingHpSmiteL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('已损失生命值 75%');
    expect(upgraded.magicEffect).toContain('生命 75%');
  });

  it('L1 → L2: description / magicEffect 75% → 100%', () => {
    const card = { ...missingHpSmiteL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('已损失生命值 100%');
    expect(upgraded.magicEffect).toContain('生命 100%');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...missingHpSmiteL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('残血终焉 (missing-hp-smite) — display (helpers.ts) uses correct percentage', () => {
  // STATE: hp 20 / maxHp 30 → missingHp = 10
  const STATE = { hp: 20, maxHp: 30, gold: 0 };

  function magic(overrides: Record<string, unknown> = {}): GameCardData {
    return {
      id: 'm1',
      type: 'magic',
      name: '残血终焉',
      value: 0,
      knightEffect: 'missing-hp-smite',
      ...overrides,
    } as any;
  }

  it('L0 (50%): 10 × 50% = 5 damage', () => {
    const r = computeDamageMagicDisplayPure(magic(), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 5 点伤害');
      expect(r.text).toContain('已损失生命 50%');
    }
  });

  it('L1 (75%): 10 × 75% → floor 7 damage', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 7 点伤害');
      expect(r.text).toContain('已损失生命 75%');
    }
  });

  it('L2 (100%): 10 × 100% = 10 damage', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 10 点伤害');
      expect(r.text).toContain('已损失生命 100%');
    }
  });
});

describe('残血终焉 (missing-hp-smite) — target resolution (hero.ts) damage path', () => {
  // computeMaxHp(state) returns INITIAL_HP (20) by default;
  // hp = 10 ⇒ missingHp = 10.

  function makeMhsCard(level?: number): GameCardData {
    return {
      id: `mhs-l${level ?? 0}`,
      type: 'magic',
      name: '残血终焉',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'missing-hp-smite',
      recycleDelay: 1,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  it('L0: missingHp 10 × 50% = 5 damage', () => {
    const card = makeMhsCard(0);
    const state = makeState({
      handCards: [card],
      hp: 10,
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'missing-hp-smite', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(95);
  });

  it('L1: missingHp 10 × 75% → floor 7 damage', () => {
    const card = makeMhsCard(1);
    const state = makeState({
      handCards: [card],
      hp: 10,
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'missing-hp-smite', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(93);
  });

  it('L2: missingHp 10 × 100% = 10 damage', () => {
    const card = makeMhsCard(2);
    const state = makeState({
      handCards: [card],
      hp: 10,
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'missing-hp-smite', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// 卡池静态校验：knightDeck 注册值与 handler 期望吻合
// ---------------------------------------------------------------------------

describe('knight class deck — 铠甲贯刺 / 残血终焉 / 坟火新星 / 淬炼冲击 / 锋刃侧击 升级配置', () => {
  it('铠甲贯刺 已声明 knightEffect: armor-strike + maxUpgradeLevel: 2', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const armorStrike = deck.find(c => c.name === '铠甲贯刺') as any;
    expect(armorStrike).toBeDefined();
    expect(armorStrike.knightEffect).toBe('armor-strike');
    expect(armorStrike.maxUpgradeLevel).toBe(2);
  });

  it('残血终焉 已声明 knightEffect: missing-hp-smite + maxUpgradeLevel: 2', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const missingHpSmite = deck.find(c => c.name === '残血终焉') as any;
    expect(missingHpSmite).toBeDefined();
    expect(missingHpSmite.knightEffect).toBe('missing-hp-smite');
    expect(missingHpSmite.maxUpgradeLevel).toBe(2);
  });

  it('坟火新星 已声明 knightEffect: grave-nova + maxUpgradeLevel: 2', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const graveNova = deck.find(c => c.name === '坟火新星') as any;
    expect(graveNova).toBeDefined();
    expect(graveNova.knightEffect).toBe('grave-nova');
    expect(graveNova.maxUpgradeLevel).toBe(2);
  });

  it('淬炼冲击 已声明 knightEffect: overkill-upgrade + maxUpgradeLevel: 2', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const overkillUpgrade = deck.find(c => c.name === '淬炼冲击') as any;
    expect(overkillUpgrade).toBeDefined();
    expect(overkillUpgrade.knightEffect).toBe('overkill-upgrade');
    expect(overkillUpgrade.maxUpgradeLevel).toBe(2);
  });

  it('锋刃侧击 已声明 knightEffect: temp-attack-strike + maxUpgradeLevel: 2 + base 描述/flankEffect 都是 20%', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('../rng');
    const [deck] = generateKnightDeck(createRng(42));
    const tempAttackStrike = deck.find(c => c.name === '锋刃侧击') as any;
    expect(tempAttackStrike).toBeDefined();
    expect(tempAttackStrike.knightEffect).toBe('temp-attack-strike');
    expect(tempAttackStrike.maxUpgradeLevel).toBe(2);
    expect(tempAttackStrike.description).toContain('20% 击晕');
    expect(tempAttackStrike.flankEffect).toContain('20%');
  });
});

// ===========================================================================
// 坟火新星 (grave-nova)
// ===========================================================================

describe('坟火新星 (grave-nova) — routing', () => {
  it('routes to knight:grave-nova via knightEffect field', () => {
    const card: GameCardData = {
      id: 'gn-route',
      type: 'magic',
      name: '坟火新星',
      value: 0,
      knightEffect: 'grave-nova',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:grave-nova');
  });
});

describe('坟火新星 (grave-nova) — handler description updates', () => {
  function graveNovaL0(): GameCardData {
    return {
      id: 'gn-handler',
      type: 'magic',
      name: '坟火新星',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：当此牌被弃置时，对当前行所有怪物造成 3 点伤害。',
      shortDescription: '弃置时对当前行所有怪物 3 伤',
      magicEffect: '被弃置时爆炸伤害。',
      knightEffect: 'grave-nova',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: description 改为 5 点伤害（单次）', () => {
    const card = graveNovaL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('5 点伤害');
    expect(upgraded.description).not.toContain('×2');
    expect(upgraded.shortDescription).toContain('5 伤');
    expect(upgraded.magicEffect).toContain('5 点');
  });

  it('L1 → L2: description 改为 3 点伤害 ×2 次（每次独立结算）', () => {
    const card = { ...graveNovaL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('3 点伤害 ×2');
    expect(upgraded.description).toContain('独立结算');
    expect(upgraded.shortDescription).toContain('3 伤 ×2');
    expect(upgraded.magicEffect).toContain('×2');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...graveNovaL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('坟火新星 (grave-nova) — display (helpers.ts)', () => {
  const STATE = { hp: 20, maxHp: 30, gold: 0 };

  function magic(overrides: Record<string, unknown> = {}): GameCardData {
    return {
      id: 'gn-display',
      type: 'magic',
      name: '坟火新星',
      value: 0,
      knightEffect: 'grave-nova',
      ...overrides,
    } as any;
  }

  it('L0: 3 damage', () => {
    const r = computeDamageMagicDisplayPure(magic(), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('3 点伤害');
      expect(r.text).not.toContain('×2');
    }
  });

  it('L1: 5 damage (single hit)', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('5 点伤害');
      expect(r.text).not.toContain('×2');
    }
  });

  it('L2: 3 damage × 2 hits', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('3 点伤害');
      expect(r.text).toContain('×2');
    }
  });

  it('L2 with amplifyBonus: per-hit damage scales (3+amp)', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 2, amplifyBonus: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('5 点伤害');
      expect(r.text).toContain('×2');
    }
  });
});

describe('坟火新星 (grave-nova) — TRIGGER_GRAVE_NOVA reducer behavior', () => {
  function makeGraveNova(level: number): GameCardData {
    return {
      id: `gn-trigger-l${level}`,
      type: 'magic',
      name: '坟火新星',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'grave-nova',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0: 对当前行所有怪物造成 3 点伤害（单次）', () => {
    const card = makeGraveNova(0);
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 100), makeMonster('m2', 100)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_GRAVE_NOVA', card } as GameAction,
    ]);
    const m1 = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    const m2 = result.state.activeCards.find(c => c?.id === 'm2') as { hp: number } | undefined;
    expect(m1?.hp).toBe(97);
    expect(m2?.hp).toBe(97);
  });

  it('L1: 对当前行所有怪物造成 5 点伤害（单次）', () => {
    const card = makeGraveNova(1);
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 100), makeMonster('m2', 100)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_GRAVE_NOVA', card } as GameAction,
    ]);
    const m1 = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    const m2 = result.state.activeCards.find(c => c?.id === 'm2') as { hp: number } | undefined;
    expect(m1?.hp).toBe(95);
    expect(m2?.hp).toBe(95);
  });

  it('L2: 对当前行所有怪物造成 3 点伤害 × 2 次 = 6 点累计', () => {
    const card = makeGraveNova(2);
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 100), makeMonster('m2', 100)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_GRAVE_NOVA', card } as GameAction,
    ]);
    const m1 = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    const m2 = result.state.activeCards.find(c => c?.id === 'm2') as { hp: number } | undefined;
    expect(m1?.hp).toBe(94);
    expect(m2?.hp).toBe(94);
  });

  it('L2 hitNumber=1 自动 enqueue 第二击 hitNumber=2（独立结算）', () => {
    const card = makeGraveNova(2);
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    // 单步 reduce 第一击；不 drain，验证 enqueuedActions 中带 hitNumber=2 的 follow-up。
    const r = reduce(state, { type: 'TRIGGER_GRAVE_NOVA', card, hitNumber: 1 });
    const followUps = r.enqueuedActions ?? [];
    const second = followUps.find(
      (a: any) => a.type === 'TRIGGER_GRAVE_NOVA' && a.hitNumber === 2,
    ) as any;
    expect(second).toBeDefined();
    expect(second.card?.id).toBe(card.id);
    // 第一击的 banner 标 "（第 1/2 次）"。
    expect(r.state.heroSkillBanner).toContain('1/2');
  });

  it('L0 不 enqueue 第二击（不带 hitNumber 行为也一致）', () => {
    const card = makeGraveNova(0);
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const r = reduce(state, { type: 'TRIGGER_GRAVE_NOVA', card });
    const followUps = r.enqueuedActions ?? [];
    const second = followUps.find(
      (a: any) => a.type === 'TRIGGER_GRAVE_NOVA',
    );
    expect(second).toBeUndefined();
  });

  it('L2 + 怪物剩 1 HP：第一击 3 dmg 击杀，第二击不会让怪物 HP 变成负数（独立结算）', () => {
    const card = makeGraveNova(2);
    const state = makeState({
      activeCards: activeRowOf(makeMonster('m1', 1)),
    });
    const result = drain(state, [
      { type: 'TRIGGER_GRAVE_NOVA', card } as GameAction,
    ]);
    // 第一击 3 dmg → HP 0（被 floor 到 0）+ defeatProcessed=true。
    // 第二击 reducer 会在 isDamageableTarget filter 里把已死的怪物排除掉；
    // 即使有人在 enqueue 链里塞了 hit-2，它也找不到目标 → reducer 早返。
    const target = result.state.activeCards.find(c => c?.id === 'm1') as
      | { hp: number; defeatProcessed?: boolean }
      | undefined;
    if (target) {
      // 怪物可能仍在 active row 占位（带 defeatProcessed）；HP 必须是 0 而不是 -2。
      expect(target.hp).toBe(0);
      expect(target.defeatProcessed).toBe(true);
    } else {
      // 也可能已经被清离 activeCards，那应该出现在 discardedCards 里。
      expect(result.state.discardedCards.some(c => c.id === 'm1')).toBe(true);
    }
  });
});

// ===========================================================================
// 淬炼冲击 (overkill-upgrade)
// ===========================================================================

describe('淬炼冲击 (overkill-upgrade) — routing', () => {
  it('routes to knight:overkill-upgrade via knightEffect field', () => {
    const card: GameCardData = {
      id: 'ok-route',
      type: 'magic',
      name: '淬炼冲击',
      value: 0,
      knightEffect: 'overkill-upgrade',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:overkill-upgrade');
  });
});

describe('淬炼冲击 (overkill-upgrade) — handler description updates', () => {
  function overkillL0(): GameCardData {
    return {
      id: 'ok-handler',
      type: 'magic',
      name: '淬炼冲击',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：对一个怪物造成 3 点伤害。超杀：升级一张牌。',
      shortDescription: '3 点伤害；超杀升级 1 张牌',
      magicEffect: '造成 3 点伤害，超杀升级一张牌。',
      knightEffect: 'overkill-upgrade',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 3 → 5 点伤害，仍只升级一张牌', () => {
    const card = overkillL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('5 点伤害');
    expect(upgraded.description).toContain('升级一张牌');
    expect(upgraded.shortDescription).toContain('5 点');
    expect(upgraded.shortDescription).toContain('升级 1 张牌');
  });

  it('L1 → L2: 仍 5 点伤害，升级数量改为 2 张牌', () => {
    const card = { ...overkillL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('5 点伤害');
    expect(upgraded.description).toContain('升级2 张牌');
    expect(upgraded.shortDescription).toContain('升级 2 张牌');
    expect(upgraded.magicEffect).toContain('升级2 张牌');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...overkillL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('淬炼冲击 (overkill-upgrade) — display (helpers.ts)', () => {
  const STATE = { hp: 20, maxHp: 30, gold: 0 };

  function magic(overrides: Record<string, unknown> = {}): GameCardData {
    return {
      id: 'ok-display',
      type: 'magic',
      name: '淬炼冲击',
      value: 0,
      knightEffect: 'overkill-upgrade',
      ...overrides,
    } as any;
  }

  it('L0: 3 damage / 升级一张牌', () => {
    const r = computeDamageMagicDisplayPure(magic(), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 3 点伤害');
      expect(r.text).toContain('升级一张牌');
    }
  });

  it('L1: 5 damage / 升级一张牌', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 5 点伤害');
      expect(r.text).toContain('升级一张牌');
    }
  });

  it('L2: 5 damage / 升级 2 张牌', () => {
    const r = computeDamageMagicDisplayPure(magic({ upgradeLevel: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 5 点伤害');
      expect(r.text).toContain('升级2 张牌');
    }
  });
});

describe('淬炼冲击 (overkill-upgrade) — initial prompt (resolveOverkillUpgrade)', () => {
  function makeOk(level: number): GameCardData {
    return {
      id: `ok-prompt-l${level}`,
      type: 'magic',
      name: '淬炼冲击',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'overkill-upgrade',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0 prompt: 3 点伤害 / 升级一张牌', () => {
    const card = makeOk(0);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const r = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = r.state.pendingMagicAction as any;
    expect(pending.effect).toBe('overkill-upgrade');
    expect(pending.step).toBe('monster-select');
    expect(pending.prompt).toContain('3 点伤害');
    expect(pending.prompt).toContain('升级一张牌');
  });

  it('L1 prompt: 5 点伤害 / 升级一张牌', () => {
    const card = makeOk(1);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const r = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = r.state.pendingMagicAction as any;
    expect(pending.prompt).toContain('5 点伤害');
    expect(pending.prompt).toContain('升级一张牌');
  });

  it('L2 prompt: 5 点伤害 / 升级 2 张牌', () => {
    const card = makeOk(2);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const r = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = r.state.pendingMagicAction as any;
    expect(pending.prompt).toContain('5 点伤害');
    expect(pending.prompt).toContain('升级2 张牌');
  });
});

describe('淬炼冲击 (overkill-upgrade) — overkill 触发 ENQUEUE_PENDING_UPGRADE_MODAL', () => {
  // 历史：曾经直接 enqueue SET_UPGRADE_MODAL_OPEN，导致同一击杀的战利品 'upgradeCard'
  // 奖励同帧也写 upgradeModalOpen=true → 两个升级请求合并成一次升级机会，玩家少一次升级。
  // 修复：改走 pendingUpgradeModalOpens 队列，每条独立 maxCount，依次弹出。
  // 见 `pendingUpgradeModalOpens` 字段 JSDoc。
  //
  // 测试断言改为「队列里有一条带正确 maxCount 的待开模态请求」，因为 monster reward
  // 几乎必然同帧入 activeMonsterReward 充当 blocker（CHECK_PENDING_UPGRADE_MODAL gate 不过），
  // 所以 drain 后 upgradeModalOpen 仍是 false（要等玩家清掉 reward 弹窗才会开）。
  function makeOk(level: number): GameCardData {
    return {
      id: `ok-overkill-l${level}`,
      type: 'magic',
      name: '淬炼冲击',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'overkill-upgrade',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0: 怪物 1 HP，3 dmg 超杀 → pendingUpgradeModalOpens 有一条 maxCount=undefined 请求', () => {
    const card = makeOk(0);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 1)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'm1' } as GameAction],
    );
    expect(result.state.pendingUpgradeModalOpens.length).toBe(1);
    expect(result.state.pendingUpgradeModalOpens[0].maxCount).toBeUndefined();
  });

  it('L1: 怪物 4 HP，5 dmg 超杀 → pendingUpgradeModalOpens 有一条 maxCount=undefined 请求', () => {
    const card = makeOk(1);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 4)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'm1' } as GameAction],
    );
    expect(result.state.pendingUpgradeModalOpens.length).toBe(1);
    expect(result.state.pendingUpgradeModalOpens[0].maxCount).toBeUndefined();
  });

  it('L2: 怪物 4 HP，5 dmg 超杀 → pendingUpgradeModalOpens 有一条 maxCount=2 请求', () => {
    const card = makeOk(2);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 4)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'm1' } as GameAction],
    );
    expect(result.state.pendingUpgradeModalOpens.length).toBe(1);
    expect(result.state.pendingUpgradeModalOpens[0].maxCount).toBe(2);
  });

  it('L2: 怪物 100 HP，5 dmg 不超杀 → 不入队，upgradeModalOpen=false（伤害正常落地）', () => {
    const card = makeOk(2);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 100)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'm1' } as GameAction],
    );
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(95);
    expect(result.state.pendingUpgradeModalOpens.length).toBe(0);
    expect(result.state.upgradeModalOpen).toBeFalsy();
  });
});

// ===========================================================================
// 锋刃侧击 (temp-attack-strike)
// ===========================================================================

describe('锋刃侧击 (temp-attack-strike) — routing', () => {
  it('routes to knight:temp-attack-strike via knightEffect field', () => {
    const card: GameCardData = {
      id: 'tas-route',
      type: 'magic',
      name: '锋刃侧击',
      value: 0,
      knightEffect: 'temp-attack-strike',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:temp-attack-strike');
  });
});

describe('锋刃侧击 (temp-attack-strike) — handler description updates', () => {
  function tasL0(): GameCardData {
    return {
      id: 'tas-handler',
      type: 'magic',
      name: '锋刃侧击',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：选择一个装备栏，对一个随机怪物造成（该装备栏永久攻击 + 临时攻击）的伤害。侧击：20% 击晕。',
      shortDescription: '该栏永久攻击+临时攻击作伤害；侧击 20% 击晕',
      magicEffect: '永久攻击+临时攻击转化为伤害，侧击 20% 击晕。',
      flankEffect: '20% 概率击晕目标',
      knightEffect: 'temp-attack-strike',
      recycleDelay: 1,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 描述 / shortDescription / magicEffect / flankEffect 全部从 20% 升到 40%', () => {
    const card = tasL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('40% 击晕');
    expect(upgraded.description).not.toContain('20% 击晕');
    expect(upgraded.shortDescription).toContain('40%');
    expect(upgraded.magicEffect).toContain('40%');
    expect(upgraded.flankEffect).toContain('40%');
  });

  it('L1 → L2: 描述 / shortDescription / magicEffect / flankEffect 全部从 40% 升到 60%', () => {
    const card = { ...tasL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('60% 击晕');
    expect(upgraded.shortDescription).toContain('60%');
    expect(upgraded.magicEffect).toContain('60%');
    expect(upgraded.flankEffect).toContain('60%');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...tasL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('锋刃侧击 (temp-attack-strike) — stun rate via dice subtitle (hero.ts)', () => {
  // 直接构造 pendingMagicAction (step: slot-select, isFlank: true)，
  // dispatch RESOLVE_MAGIC_SLOT_SELECTION，让 hero.ts case 'temp-attack-strike'
  // 抽 dice 时把击晕率塞进 sideEffects 的 ui:requestDice subtitle 里。
  function makeTas(level: number): GameCardData {
    return {
      id: `tas-stun-l${level}`,
      type: 'magic',
      name: '锋刃侧击',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'temp-attack-strike',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  function makeWeapon(): EquipmentItem {
    return {
      id: 'w1',
      type: 'weapon' as const,
      name: 'Sword',
      value: 5,
      durability: 5,
      maxDurability: 5,
    } as EquipmentItem;
  }

  function buildState(card: GameCardData): GameState {
    return makeState({
      handCards: [card],
      equipmentSlot1: makeWeapon(),
      equipmentSlot2: null,
      // 永攻 + 临攻 = 5（保证 totalDamage > 0，stun 路径才被走到）。
      equipmentSlotBonuses: {
        equipmentSlot1: { damage: 3, shield: 0 },
        equipmentSlot2: { damage: 0, shield: 0 },
      },
      slotTempAttack: { equipmentSlot1: 2 } as any,
      activeCards: activeRowOf(makeMonster('m1', 100)),
      // pendingMagicAction 已经走到 slot-select 阶段，且带 isFlank=true 触发 stun 分支。
      pendingMagicAction: {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        isFlank: true,
        prompt: '...',
      } as any,
      stunCap: 100,
    } as any);
  }

  function getStunSubtitleFromResult(r: ReturnType<typeof drain>): string | undefined {
    for (const se of (r.sideEffects ?? []) as any[]) {
      if (se.event === 'ui:requestDice') {
        const subtitle = se.payload?.subtitle as string | undefined;
        if (subtitle && subtitle.includes('侧击击晕判定')) return subtitle;
      }
    }
    return undefined;
  }

  it('L0: dice subtitle 显示 "侧击击晕判定（20%）"', () => {
    const card = makeTas(0);
    const state = buildState(card);
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const subtitle = getStunSubtitleFromResult(result);
    expect(subtitle).toBeDefined();
    expect(subtitle).toContain('20%');
  });

  it('L1: dice subtitle 显示 "侧击击晕判定（40%）"', () => {
    const card = makeTas(1);
    const state = buildState(card);
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const subtitle = getStunSubtitleFromResult(result);
    expect(subtitle).toBeDefined();
    expect(subtitle).toContain('40%');
  });

  it('L2: dice subtitle 显示 "侧击击晕判定（60%）"', () => {
    const card = makeTas(2);
    const state = buildState(card);
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const subtitle = getStunSubtitleFromResult(result);
    expect(subtitle).toBeDefined();
    expect(subtitle).toContain('60%');
  });

  it('L0 + 怪物受到伤害（5 dmg）', () => {
    const card = makeTas(0);
    const state = buildState(card);
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-strike', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    const m = result.state.activeCards.find(c => c?.id === 'm1') as { hp: number } | undefined;
    expect(m?.hp).toBe(95);
  });
});
