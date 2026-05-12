/**
 * 囊中惊雷 (knight:backpack-bolt) — Perm 1 magic.
 *
 * Behavior:
 *   - PLAY_CARD always opens monster-select picker (allowsHeroTarget: true).
 *     单目标伤害 magic 自伤 path; hero cell 也是合法目标。
 *   - Damage = floor(state.backpackItems.length * pct / 100) + amplifyBonus
 *     → spell damage formula (×echoMultiplier on resolve).
 *   - pct 由升级等级决定: lvl 0 → 50, lvl 1 → 75, lvl 2 → 100.
 *   - Echo (A 类): damage ×N (single flight, no modal re-prompt).
 *   - 不变量: 任何对怪物的伤害都必须激怒目标
 *     (monster-damage-engagement.mdc).
 *   - Hero target: 自伤；与其它 allowsHeroTarget 单目标伤害 magic 一致。
 *   - 出牌后 pendingMagicAction 应清空。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ActiveRowSlots } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import { isDamageMagic, computeDamageMagicDisplayPure } from '../helpers';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [], currentTurn: 'hero' } as any,
    phase: 'playerInput' as any,
    ...overrides,
  };
}

function makeCard(idSuffix = 'bb', extras: Record<string, any> = {}): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '囊中惊雷',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'backpack-bolt',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
    ...extras,
  } as GameCardData;
}

function makeMonster(id: string, hp = 50): GameCardData {
  return {
    id,
    type: 'monster',
    name: `M${id}`,
    value: hp,
    image: '',
    hp,
    maxHp: hp,
    attack: 0,
    currentLayer: 1,
    hpLayers: 1,
    fury: 1,
  } as GameCardData;
}

function makeFiller(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: 'Filler',
    value: 0,
    image: '',
  } as GameCardData;
}

function activeRowOf(...monsters: GameCardData[]): ActiveRowSlots {
  const row: (GameCardData | null)[] = [null, null, null, null, null];
  for (let i = 0; i < monsters.length && i < 5; i++) row[i] = monsters[i];
  return row as unknown as ActiveRowSlots;
}

function makeBackpack(n: number): GameCardData[] {
  const items: GameCardData[] = [];
  for (let i = 0; i < n; i++) items.push(makeFiller(`bp${i}`));
  return items;
}

function playAndPick(state: GameState, cardId: string, monsterId: string) {
  const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId } as GameAction]);
  return drain(
    afterPlay.state,
    [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'backpack-bolt', monsterId } as GameAction],
  );
}

// ---------------------------------------------------------------------------
// 1) isDamageMagic / computeDamageMagicDisplayPure
// ---------------------------------------------------------------------------

describe('囊中惊雷 — recognized as damage magic', () => {
  it('isDamageMagic returns true', () => {
    expect(isDamageMagic(makeCard())).toBe(true);
  });

  it('display: lvl 0, backpack 7 → floor(7*50/100)=3 法伤', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard(),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 7 },
    );
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 3 点法术伤害');
      expect(r.text).toContain('背包 7 张 × 50%');
      expect(r.amplifyBonus).toBe(0);
    }
  });

  it('display: lvl 1, backpack 7 → floor(7*75/100)=5', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('d', { upgradeLevel: 1 }),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 7 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 5 点法术伤害');
      expect(r.text).toContain('× 75%');
    }
  });

  it('display: lvl 2, backpack 7 → 7*100/100=7', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('d', { upgradeLevel: 2 }),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 7 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 7 点法术伤害');
      expect(r.text).toContain('× 100%');
    }
  });

  it('display: amplifyBonus 加在 base 上', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('d', { amplifyBonus: 2 }),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 10 },
    );
    if (r?.mode === 'replace') {
      // base = floor(10*50/100) = 5; 5 + 2 = 7
      expect(r.text).toContain('造成 7 点法术伤害');
    }
  });

  it('display: 背包 0 张 → 0 法伤（不报错）', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard(),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 0 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 0 点法术伤害');
    }
  });
});

// ---------------------------------------------------------------------------
// 2) PLAY_CARD — opens monster-select picker
// ---------------------------------------------------------------------------

describe('囊中惊雷 PLAY_CARD — opens monster-select picker', () => {
  it('always opens picker (single monster present)', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(4),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('backpack-bolt');
    expect(pending?.step).toBe('monster-select');
    expect(pending?.allowsHeroTarget).toBe(true);
    // 注意 setup 时 backpack 还没扣本卡（本卡是从 handCards 出的）→ length 4
    expect(pending?.data?.backpackCount).toBe(4);
    expect(pending?.data?.pct).toBe(50);
    expect(pending?.data?.baseDmg).toBe(2); // floor(4*50/100)
  });

  it('zero monsters: picker still opens (hero 是唯一合法目标)', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(4),
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('backpack-bolt');
    expect(pending?.allowsHeroTarget).toBe(true);
  });

  it('multiple monsters: pendingMagicAction set, no immediate damage', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(6),
      activeCards: activeRowOf(makeMonster('m1', 50), makeMonster('m2', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.activeCards.find(c => c?.id === 'm2')?.hp).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 3) Damage formula correctness across upgrade levels
// ---------------------------------------------------------------------------

describe('囊中惊雷 RESOLVE — damage formula', () => {
  it('lvl 0: backpack 8 → floor(8*50/100)=4 damage on monster', () => {
    const card = makeCard('lvl0');
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(46);
    // 不变量：怪物受伤 → 必须激怒
    expect(result.state.combatState.engagedMonsterIds).toContain('m1');
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('lvl 1: backpack 8 → floor(8*75/100)=6 damage', () => {
    const card = makeCard('lvl1', { upgradeLevel: 1 });
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(44);
  });

  it('lvl 2: backpack 8 → 8*100/100=8 damage', () => {
    const card = makeCard('lvl2', { upgradeLevel: 2 });
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(42);
  });

  it('floor rounding: lvl 0, backpack 7 → floor(3.5)=3 damage', () => {
    const card = makeCard('floor');
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(7),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(47);
  });

  it('empty backpack: 0 damage; spell still consumed; monster still engaged', () => {
    const card = makeCard('zero');
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    // engagement still happens (any-damage-engages 不变量；safety net 也兜底)
    expect(result.state.combatState.engagedMonsterIds).toContain('m1');
    // card consumed: not in hand anymore
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
  });

  it('amplifyBonus is added to base before spell-damage bonus', () => {
    const card = makeCard('amp', { amplifyBonus: 3 });
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      permanentSpellDamageBonus: 2,
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    // base = floor(8*50/100) = 4; total = (4 + 3) + spell bonus 2 = 9
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// 4) Multi monsters — only the picked one takes damage / engaged
// ---------------------------------------------------------------------------

describe('囊中惊雷 — selecting one monster only damages that one', () => {
  it('picks m2: m1 untouched, m2 takes damage and engaged', () => {
    const card = makeCard('pick');
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50), makeMonster('m2', 50)),
    });
    const result = playAndPick(state, card.id, 'm2');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.activeCards.find(c => c?.id === 'm2')?.hp).toBe(46);
    expect(result.state.combatState.engagedMonsterIds).toContain('m2');
    expect(result.state.combatState.engagedMonsterIds).not.toContain('m1');
  });
});

// ---------------------------------------------------------------------------
// 5) Hero target (self-damage) — allowsHeroTarget true
// ---------------------------------------------------------------------------

describe('囊中惊雷 — hero target self-damage path', () => {
  it('selecting hero takes damage from hero hp (not monster)', () => {
    const card = makeCard('hero');
    const state = makeState({
      handCards: [card],
      hp: 30,
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [
        {
          type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
          magicId: 'backpack-bolt',
          targetType: 'hero',
        } as GameAction,
      ],
    );
    // base = floor(8*50/100) = 4
    expect(result.state.hp).toBe(26);
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    expect(result.state.pendingMagicAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6) 抽牌：每造成 3 点伤害额外抽 1 张牌（floor(totalDmg / 3)）
//    - 按计算总伤算（溢杀也算）
//    - hero / 盾自伤也触发抽牌
//    - 阈值固定 3，不随升级变化
//    - Echo (A 类)：totalDmg ×N 后整体除 3
// ---------------------------------------------------------------------------

describe('囊中惊雷 — 每 3 点伤害抽 1 张牌', () => {
  it('lvl 0 backpack 8 → totalDmg 4 → 抽 1 张', () => {
    const card = makeCard('draw1');
    // 背包里第 1 张是 card 本身（其实 card 在 handCards），下面构造 9 张 filler
    // → setup 时 backpack 9 张？不对：setup 之前 PLAY_CARD 会把 card 从 handCards
    // 移走，但不会动 backpackItems。我们让 backpack 8 张 filler。
    // base = floor(8*50/100) = 4 → totalDmg 4 → drawCount = floor(4/3) = 1
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const beforeHand = state.handCards.length; // 1
    const beforeBackpack = state.backpackItems.length; // 8
    const result = playAndPick(state, card.id, 'm1');
    // monster 受 4 伤
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(46);
    // 抽 1 张：手牌 +1（card 已消耗），backpack -1
    // 出牌前 hand=1，出牌后 card 离手 → 0；抽 1 张 → 1
    expect(result.state.handCards.length).toBe(beforeHand);
    expect(result.state.backpackItems.length).toBe(beforeBackpack - 1);
  });

  it('lvl 0 backpack 4 → totalDmg 2 → 抽 0 张（不足 3）', () => {
    const card = makeCard('draw0');
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(4),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    // base = floor(4*50/100) = 2 → drawCount = floor(2/3) = 0
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(48);
    // 没抽牌：hand 出牌后回到 0
    expect(result.state.handCards.length).toBe(0);
    expect(result.state.backpackItems.length).toBe(4);
  });

  it('lvl 2 backpack 12 → totalDmg 12 → 抽 4 张', () => {
    const card = makeCard('draw4', { upgradeLevel: 2 });
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(12),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    // base = 12*100/100 = 12 → totalDmg 12 → drawCount = floor(12/3) = 4
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(38);
    expect(result.state.handCards.length).toBe(4);
    expect(result.state.backpackItems.length).toBe(12 - 4);
  });

  it('溢杀也算：totalDmg 12 打 5 HP 怪 → 仍抽 4 张', () => {
    const card = makeCard('overkill', { upgradeLevel: 2 });
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(12),
      activeCards: activeRowOf(makeMonster('m1', 5)),
    });
    const result = playAndPick(state, card.id, 'm1');
    // 怪物 HP 归 0（defeated）。本测试不关心 reward queue / 离场动画顺序，
    // 只验证「抽牌按计算总伤算，溢杀部分不被截断」。
    const m1 = result.state.activeCards.find(c => c?.id === 'm1');
    expect(m1?.hp ?? 0).toBeLessThanOrEqual(0);
    // 抽牌按计算总伤 12 算：drawCount = floor(12/3) = 4
    expect(result.state.handCards.length).toBe(4);
    expect(result.state.backpackItems.length).toBe(12 - 4);
  });

  it('hero target 自伤也抽牌', () => {
    const card = makeCard('herodraw');
    const state = makeState({
      handCards: [card],
      hp: 30,
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [
        {
          type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
          magicId: 'backpack-bolt',
          targetType: 'hero',
        } as GameAction,
      ],
    );
    // base = floor(8*50/100) = 4 → 自伤 4 → 抽 floor(4/3) = 1 张
    expect(result.state.hp).toBe(26);
    expect(result.state.handCards.length).toBe(1);
    expect(result.state.backpackItems.length).toBe(8 - 1);
  });

  it('背包空 → totalDmg 0 → 抽 0 张', () => {
    const card = makeCard('empty');
    const state = makeState({
      handCards: [card],
      backpackItems: [],
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(50);
    // 没抽牌
    expect(result.state.handCards.length).toBe(0);
  });

  it('amplifyBonus 加在抽牌阈值之前：base 4 + amp 4 = 8 → 抽 2 张', () => {
    const card = makeCard('amp', { amplifyBonus: 4 });
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    // base = floor(8*50/100) = 4; totalDmg = 4 + 4 = 8 → drawCount = floor(8/3) = 2
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(42);
    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(8 - 2);
  });

  it('display: dmg 8 → 文案始终展示抽牌规则「每 3 伤害抽 1 张牌」', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('disp', { upgradeLevel: 2 }),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 8 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 8 点法术伤害');
      expect(r.text).toContain('每 3 伤害抽 1 张牌');
    }
  });

  it('display: dmg 2 → 文案仍要展示抽牌规则（即使当下不触发抽牌）', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('disp0'),
      { hp: 20, maxHp: 30, gold: 0, backpackCount: 5 },
    );
    if (r?.mode === 'replace') {
      // base = floor(5*50/100) = 2 → drawCount = floor(2/3) = 0
      expect(r.text).toContain('造成 2 点法术伤害');
      expect(r.text).toContain('每 3 伤害抽 1 张牌');
    }
  });

  it('Echo (×2)：base 4 → totalDmg 8 → 抽 2 张（按总伤算抽牌）', () => {
    const card = makeCard('echo');
    const state = makeState({
      handCards: [card],
      backpackItems: makeBackpack(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
      doubleNextMagic: true,
    });
    const result = playAndPick(state, card.id, 'm1');
    // base = floor(8*50/100) = 4; totalDmg = 4 × 2 = 8
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(42);
    // drawCount = floor(8/3) = 2（自然按 ×N 后总伤算）
    expect(result.state.handCards.length).toBe(2);
    expect(result.state.backpackItems.length).toBe(8 - 2);
    // doubleNextMagic 应被引擎消耗
    expect(result.state.doubleNextMagic).toBe(false);
  });
});
