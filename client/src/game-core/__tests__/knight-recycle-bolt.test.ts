/**
 * 池中惊雷 (knight:recycle-bolt) — Perm 1 magic.
 *
 * 与 囊中惊雷 (knight:backpack-bolt) 成对照——前者数 backpackItems，本卡数
 * permanentMagicRecycleBag。其它行为完全一致：
 *   - PLAY_CARD always opens monster-select picker (allowsHeroTarget: true).
 *   - Damage = floor(state.permanentMagicRecycleBag.length * pct / 100) + amplifyBonus
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

function makeCard(idSuffix = 'rb', extras: Record<string, any> = {}): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '池中惊雷',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'permanent',
    knightEffect: 'recycle-bolt',
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

function makeRecycleBag(n: number): GameCardData[] {
  const items: GameCardData[] = [];
  for (let i = 0; i < n; i++) items.push(makeFiller(`rc${i}`));
  return items;
}

function playAndPick(state: GameState, cardId: string, monsterId: string) {
  const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId } as GameAction]);
  return drain(
    afterPlay.state,
    [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'recycle-bolt', monsterId } as GameAction],
  );
}

// ---------------------------------------------------------------------------
// 1) isDamageMagic / computeDamageMagicDisplayPure
// ---------------------------------------------------------------------------

describe('池中惊雷 — recognized as damage magic', () => {
  it('isDamageMagic returns true', () => {
    expect(isDamageMagic(makeCard())).toBe(true);
  });

  it('display: lvl 0, recycleBag 7 → floor(7*50/100)=3 法伤', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard(),
      { hp: 20, maxHp: 30, gold: 0, recycleBagCount: 7 },
    );
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 3 点法术伤害');
      expect(r.text).toContain('回收袋 7 张 × 50%');
      expect(r.amplifyBonus).toBe(0);
    }
  });

  it('display: lvl 1, recycleBag 7 → floor(7*75/100)=5', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('d', { upgradeLevel: 1 }),
      { hp: 20, maxHp: 30, gold: 0, recycleBagCount: 7 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 5 点法术伤害');
      expect(r.text).toContain('× 75%');
    }
  });

  it('display: lvl 2, recycleBag 7 → 7*100/100=7', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('d', { upgradeLevel: 2 }),
      { hp: 20, maxHp: 30, gold: 0, recycleBagCount: 7 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 7 点法术伤害');
      expect(r.text).toContain('× 100%');
    }
  });

  it('display: amplifyBonus 加在 base 上', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard('d', { amplifyBonus: 2 }),
      { hp: 20, maxHp: 30, gold: 0, recycleBagCount: 10 },
    );
    if (r?.mode === 'replace') {
      // base = floor(10*50/100) = 5; 5 + 2 = 7
      expect(r.text).toContain('造成 7 点法术伤害');
    }
  });

  it('display: 回收袋 0 张 → 0 法伤（不报错）', () => {
    const r = computeDamageMagicDisplayPure(
      makeCard(),
      { hp: 20, maxHp: 30, gold: 0, recycleBagCount: 0 },
    );
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 0 点法术伤害');
    }
  });
});

// ---------------------------------------------------------------------------
// 2) PLAY_CARD — opens monster-select picker
// ---------------------------------------------------------------------------

describe('池中惊雷 PLAY_CARD — opens monster-select picker', () => {
  it('always opens picker (single monster present)', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(4),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('recycle-bolt');
    expect(pending?.step).toBe('monster-select');
    expect(pending?.allowsHeroTarget).toBe(true);
    // setup 时本卡还没进 recycle bag（recycle bag 还是 4），与 backpack-bolt 同理
    expect(pending?.data?.recycleCount).toBe(4);
    expect(pending?.data?.pct).toBe(50);
    expect(pending?.data?.baseDmg).toBe(2); // floor(4*50/100)
  });

  it('zero monsters: picker still opens (hero 是唯一合法目标)', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(4),
      activeCards: [null, null, null, null, null] as unknown as ActiveRowSlots,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.effect).toBe('recycle-bolt');
    expect(pending?.allowsHeroTarget).toBe(true);
  });

  it('multiple monsters: pendingMagicAction set, no immediate damage', () => {
    const card = makeCard();
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(6),
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

describe('池中惊雷 RESOLVE — damage formula', () => {
  it('lvl 0: recycleBag 8 → floor(8*50/100)=4 damage on monster', () => {
    const card = makeCard('lvl0');
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(46);
    // 不变量：怪物受伤 → 必须激怒
    expect(result.state.combatState.engagedMonsterIds).toContain('m1');
    expect(result.state.pendingMagicAction).toBeNull();
  });

  it('lvl 1: recycleBag 8 → floor(8*75/100)=6 damage', () => {
    const card = makeCard('lvl1', { upgradeLevel: 1 });
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(44);
  });

  it('lvl 2: recycleBag 8 → 8*100/100=8 damage', () => {
    const card = makeCard('lvl2', { upgradeLevel: 2 });
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(42);
  });

  it('floor rounding: lvl 0, recycleBag 7 → floor(3.5)=3 damage', () => {
    const card = makeCard('floor');
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(7),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(47);
  });

  it('empty recycleBag: 0 damage; spell still consumed; monster still engaged', () => {
    const card = makeCard('zero');
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: [],
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
      permanentMagicRecycleBag: makeRecycleBag(8),
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

describe('池中惊雷 — selecting one monster only damages that one', () => {
  it('picks m2: m1 untouched, m2 takes damage and engaged', () => {
    const card = makeCard('pick');
    const state = makeState({
      handCards: [card],
      permanentMagicRecycleBag: makeRecycleBag(8),
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

describe('池中惊雷 — hero target self-damage path', () => {
  it('selecting hero takes damage from hero hp (not monster)', () => {
    const card = makeCard('hero');
    const state = makeState({
      handCards: [card],
      hp: 30,
      permanentMagicRecycleBag: makeRecycleBag(8),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const result = drain(
      afterPlay.state,
      [
        {
          type: 'RESOLVE_MAGIC_MONSTER_SELECTION',
          magicId: 'recycle-bolt',
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
// 6) 区分 backpack-bolt 与 recycle-bolt：前者只数 backpack，后者只数 recycle bag
// ---------------------------------------------------------------------------

describe('池中惊雷 — only counts recycle bag, not backpack', () => {
  it('backpack 100 张但回收袋只有 4 → 仍是 floor(4*50/100)=2 伤害', () => {
    const card = makeCard('iso');
    const state = makeState({
      handCards: [card],
      backpackItems: makeRecycleBag(100), // 100 张 backpack（应被忽略）
      permanentMagicRecycleBag: makeRecycleBag(4),
      activeCards: activeRowOf(makeMonster('m1', 50)),
    });
    const result = playAndPick(state, card.id, 'm1');
    expect(result.state.activeCards.find(c => c?.id === 'm1')?.hp).toBe(48);
  });
});
