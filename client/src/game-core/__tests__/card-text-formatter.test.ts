/**
 * Card text formatter — Phase 1 coverage.
 *
 * For each card with `maxUpgradeLevel > 0` that has NO on-upgrade handler
 * (the historical handler-less gap), verify that dispatching `UPGRADE_CARD`
 * through the real reducer chain bumps the card's `description` /
 * `shortDescription` / `magicEffect` to the level-appropriate text.
 *
 * End-to-end shape: state → `reduce(UPGRADE_CARD)` → patched hand card →
 * assert text fields (per testing.mdc).
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { STARTER_CARD_IDS } from '../deck';

// Side-effect import: registers all upgrade handlers + card-text formatters.
import '../card-schema';
import '../card-schema/definitions/card-text';

function makeStateWithHandCard(card: GameCardData): GameState {
  return {
    ...createInitialGameState(),
    handCards: [card],
  };
}

function upgradeNTimes(initial: GameState, cardId: string, n: number): GameState {
  let state = initial;
  for (let i = 0; i < n; i++) {
    state = reduce(state, { type: 'UPGRADE_CARD', cardId }).state;
  }
  return state;
}

function findHandCard(state: GameState, id: string): GameCardData {
  const card = state.handCards.find(c => c.id === id);
  if (!card) throw new Error(`card ${id} not in hand`);
  return card;
}

describe('card text formatter — handler-less cards refresh description on upgrade', () => {
  describe('怀柔令 (knight:persuade-discount)', () => {
    const baseCard: GameCardData = {
      id: 'magic-persuade-discount-1',
      type: 'magic',
      name: '怀柔令',
      value: 0,
      magicType: 'instant',
      magicEffect: '劝降费用永久 -2，下次成功率 +10%。',
      description: '一次性：劝降费用永久降低 2 金币，下次劝降成功率 +10%。',
      shortDescription: '劝降费用永久 -2；下次成功率 +10%',
      knightEffect: 'persuade-discount',
      maxUpgradeLevel: 2,
    } as GameCardData;

    it('Lv 0 → Lv 1: cost -2 → -4, rate +10% → +20%', () => {
      const initial = makeStateWithHandCard(baseCard);
      const after = upgradeNTimes(initial, baseCard.id, 1);
      const upgraded = findHandCard(after, baseCard.id);

      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.description).toBe('一次性：劝降费用永久降低 4 金币，下次劝降成功率 +20%。');
      expect(upgraded.shortDescription).toBe('劝降费用永久 -4；下次成功率 +20%');
      expect(upgraded.magicEffect).toBe('劝降费用永久 -4，下次成功率 +20%。');
    });

    it('Lv 0 → Lv 2: cost -2 → -6, rate +10% → +30%', () => {
      const initial = makeStateWithHandCard(baseCard);
      const after = upgradeNTimes(initial, baseCard.id, 2);
      const upgraded = findHandCard(after, baseCard.id);

      expect(upgraded.upgradeLevel).toBe(2);
      expect(upgraded.description).toBe('一次性：劝降费用永久降低 6 金币，下次劝降成功率 +30%。');
      expect(upgraded.shortDescription).toBe('劝降费用永久 -6；下次成功率 +30%');
      expect(upgraded.magicEffect).toBe('劝降费用永久 -6，下次成功率 +30%。');
    });
  });

  describe('紧急回收 (knight:recall-equipment, knight class card)', () => {
    // Knight class 紧急回收 now scales numerically with upgrade:
    //   L0: 失去 2 HP，抽 1 张
    //   L1: 失去 1 HP，抽 2 张（formatter rewrites text）
    //   L2: 数值同 L1；formatter 不再改文案，OnUpgradeHandler 在卡上盖
    //       `topOnRecycleRestore: true` flag（角标在 GameCard 自动渲染，不进描述）。
    const baseCard: GameCardData = {
      id: 'knight-recall-equipment-1',
      type: 'magic',
      name: '紧急回收',
      value: 0,
      classCard: true,
      magicType: 'permanent',
      magicEffect: '失去 2 HP，回手一张牌，抽 1 张牌。',
      description: '永久：失去 2 点生命，回手一张牌，抽 1 张牌。',
      shortDescription: '失去 2 生命，回手 1 张，抽 1 张',
      knightEffect: 'recall-equipment',
      maxUpgradeLevel: 2,
    } as GameCardData;

    it('Lv 1: text rewrites to "失去 1 生命，回手 1 张，抽 2 张"', () => {
      const initial = makeStateWithHandCard(baseCard);
      const after = upgradeNTimes(initial, baseCard.id, 1);
      const upgraded = findHandCard(after, baseCard.id);

      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.description).toBe('永久：失去 1 点生命，回手一张牌，抽 2 张牌。');
      expect(upgraded.shortDescription).toBe('失去 1 生命，回手 1 张，抽 2 张');
      expect(upgraded.magicEffect).toBe('失去 1 HP，回手一张牌，抽 2 张牌。');
      // L1 还没盖 置顶 戳
      expect((upgraded as any).topOnRecycleRestore).not.toBe(true);
    });

    it('Lv 2: text stays at Lv 1 数值（1 HP / 2 抽）；卡自身刻上 topOnRecycleRestore', () => {
      const initial = makeStateWithHandCard(baseCard);
      const after = upgradeNTimes(initial, baseCard.id, 2);
      const upgraded = findHandCard(after, baseCard.id);

      expect(upgraded.upgradeLevel).toBe(2);
      expect(upgraded.description).toBe('永久：失去 1 点生命，回手一张牌，抽 2 张牌。');
      expect(upgraded.shortDescription).toBe('失去 1 生命，回手 1 张，抽 2 张');
      expect(upgraded.magicEffect).toBe('失去 1 HP，回手一张牌，抽 2 张牌。');
      expect((upgraded as any).topOnRecycleRestore).toBe(true);
    });
  });

  describe('查阅动作 (starter:starter-perm-survey-action)', () => {
    const baseCard: GameCardData = {
      id: STARTER_CARD_IDS.surveyAction,
      type: 'magic',
      name: '查阅动作',
      value: 0,
      magicType: 'permanent',
      magicEffect: '永久魔法：从背包抽 1 张牌。',
      description: '从背包抽 1 张牌。\n上手：随机一个装备栏 临时攻击 +1。',
      shortDescription: '抽 1 张；上手随机一栏 +1 临时攻',
      onEnterHandEffect: 'survey-action-onhand',
      maxUpgradeLevel: 1,
    } as GameCardData;

    it('Lv 0 → Lv 1: on-hand temp attack 1 → 2', () => {
      const initial = makeStateWithHandCard(baseCard);
      const after = upgradeNTimes(initial, baseCard.id, 1);
      const upgraded = findHandCard(after, baseCard.id);

      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.description).toBe('从背包抽 1 张牌。\n上手：随机一个装备栏 临时攻击 +2。');
      expect(upgraded.shortDescription).toBe('抽 1 张；上手随机一栏 +2 临时攻');
    });
  });

  describe('锐意鼓舞 (starter:starter-perm-flank-slot-temp-attack)', () => {
    // The deck card explicitly omits `magicEffect` to force starter-id routing
    // (see event-grant-card-id-suffix.mdc). The formatter mirrors that and
    // does NOT touch `magicEffect`.
    const baseCard: GameCardData = {
      id: STARTER_CARD_IDS.flankSlotTempAttack,
      type: 'magic',
      name: '锐意鼓舞',
      value: 0,
      magicType: 'permanent',
      description: '左装备栏 +3 临时攻击；侧击则改为右装备栏 +3。升级 1：+5。',
      shortDescription: '左栏 +3 临时攻；侧击改右栏 +3',
      maxUpgradeLevel: 1,
    } as GameCardData;

    it('Lv 0 → Lv 1: slot temp attack 3 → 5', () => {
      const initial = makeStateWithHandCard(baseCard);
      const after = upgradeNTimes(initial, baseCard.id, 1);
      const upgraded = findHandCard(after, baseCard.id);

      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.description).toBe('左装备栏 +5 临时攻击；侧击则改为右装备栏 +5。');
      expect(upgraded.shortDescription).toBe('左栏 +5 临时攻；侧击改右栏 +5');
    });
  });
});

describe('card text formatter — handler + formatter cohabitation', () => {
  // Sanity check: a card that already has a registered on-upgrade handler
  // (e.g. `starter:weaponBurst`) keeps its existing imperative description,
  // because Phase 1 does not register a formatter for it. The formatter
  // pipeline returns null and `applyUpgrade` leaves the handler-set text
  // untouched.
  it('starter weaponBurst (has handler, no formatter) keeps handler-produced description', () => {
    const baseCard: GameCardData = {
      id: STARTER_CARD_IDS.weaponBurst,
      type: 'magic',
      name: '武器爆裂',
      value: 0,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备栏，临时攻击力 +2（瀑流后重置）。',
      description: '选择一个装备栏，临时攻击力 +2（瀑流后重置）。',
      shortDescription: '所选栏临时攻击 +2（瀑流后重置）',
      maxUpgradeLevel: 2,
    } as GameCardData;

    const initial = makeStateWithHandCard(baseCard);
    const after = upgradeNTimes(initial, baseCard.id, 1);
    const upgraded = findHandCard(after, baseCard.id);

    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('+4');
  });
});
