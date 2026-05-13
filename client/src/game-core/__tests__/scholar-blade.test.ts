/**
 * 智者之刃 (knight:scholar-blade)
 *
 * 4 攻 / 3 耐久。每次攻击从背包抽 N 张牌（drawOnAttack: N）。
 * 触发位置 = `combat.ts:reducePerformHeroAttack` 的 `drawOnAttack` 分支
 * （紧邻 `healOnAttack` 块，与之共享 `overclockExtra` 计数和
 * `overclockFiredThisAttack` 计费标记）。
 *
 * 实现规则覆盖：
 *   - draw-cards-defaults-to-backpack：走 `DRAW_CARDS source: 'backpack'`，
 *     自动尊重背包置顶优先级。
 *   - shared-effect-id-impact-check：drawOnAttack 是新字段、目前唯一消费方
 *     是这条卡，但仍跑 PERFORM_HERO_ATTACK 端到端确保 fork chain 无断裂。
 *   - pipeline-input-continuation：fixture phase: 'playerInput'，DRAW_CARDS 在
 *     pipeline.ts:368 已白名单，攻击链 drain 不会卡。
 *
 * 升级（mirror 智者圣盾的 L0/L1/L2 表，但 maxDur 走 delta 保留 mid-game amp）：
 *   - L0: 4 攻 / 3 耐久，每次攻击抽 2 张
 *   - L1: 4 攻 / 4 耐久（+1 maxDur 走 applyMaxDurabilityDelta 保留破损）
 *   - L2: 4 攻 / 4 耐久，每次攻击抽 3 张
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { executeOnUpgrade } from '../card-schema/on-upgrade';
import { computeCardText } from '../card-schema/card-text';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    phase: 'playerInput',
    ...overrides,
  };
}

function makeWeapon(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 's-blade',
    type: 'weapon',
    name: '智者之刃',
    value: 4,
    image: '',
    durability: 3,
    maxDurability: 3,
    drawOnAttack: 2,
    knightEffect: 'scholar-blade',
    classCard: true,
    maxUpgradeLevel: 2,
    upgradeLevel: 0,
  } as GameCardData;
}

function makeBackpackCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `bp-${id}`,
    value: 0,
    image: '',
    magicType: 'instant',
  } as GameCardData;
}

function makeMonster(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'm1',
    type: 'monster',
    name: 'Goblin',
    value: 1,
    attack: 1,
    hp: 100,
    maxHp: 100,
    fury: 1,
    currentLayer: 1,
    ...over,
  } as GameCardData;
}

// Mirror cardUpgrade.ts:applyUpgrade(): bump level, run on-upgrade handler, then
// refresh derived text via the registered formatter.
function applyUpgrade(card: GameCardData, newLevel: number): GameCardData {
  const upgraded: GameCardData = { ...card, upgradeLevel: newLevel };
  executeOnUpgrade(upgraded, newLevel, createInitialGameState());
  const text = computeCardText(upgraded, createInitialGameState());
  if (text) {
    if (text.description !== undefined) upgraded.description = text.description;
    if (text.shortDescription !== undefined) upgraded.shortDescription = text.shortDescription;
    if (text.magicEffect !== undefined) upgraded.magicEffect = text.magicEffect;
  }
  return upgraded;
}

// ---------------------------------------------------------------------------
// 1) Deck entry
// ---------------------------------------------------------------------------

describe('knight class deck: 智者之刃 entry', () => {
  it('appears in generateKnightDeck with 4 attack / 3 durability / drawOnAttack: 2', () => {
    const [deck] = generateKnightDeck(createRng(11));
    const card = deck.find(c => c.name === '智者之刃');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('weapon');
    expect(card?.value).toBe(4);
    expect(card?.durability).toBe(3);
    expect(card?.maxDurability).toBe(3);
    expect((card as any)?.drawOnAttack).toBe(2);
    expect((card as any)?.knightEffect).toBe('scholar-blade');
    expect(card?.classCard).toBe(true);
    expect((card as any)?.maxUpgradeLevel).toBe(2);
    expect((card as any)?.unique).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2) Per-attack draw — PERFORM_HERO_ATTACK 端到端
//
// 验证：装好 4攻 武器、激活行有怪物、PERFORM_HERO_ATTACK → 攻击命中 + 从背包抽 1 张。
// ---------------------------------------------------------------------------

describe('智者之刃 攻击触发 — PERFORM_HERO_ATTACK 路径', () => {
  it('攻击一次：从背包抽 2 张牌进手牌（耐久 -1）', () => {
    const weapon = makeWeapon();
    const monster = makeMonster();
    const bp1 = makeBackpackCard('bp-1');
    const bp2 = makeBackpackCard('bp-2');

    const state = makeState({
      handCards: [],
      backpackItems: [bp1, bp2],
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        currentTurn: 'hero',
        heroAttacksRemaining: 1,
        engagedMonsterIds: [monster.id],
      },
    });

    const r = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: monster.id } as GameAction,
    ]);

    expect(r.state.handCards.length).toBe(2);
    expect(r.state.backpackItems.length).toBe(0);

    const log = r.sideEffects.find(e =>
      e.event === 'log:entry'
      && (e.payload as any)?.message?.includes('智者之刃 攻击：从背包抽 2 张牌'),
    );
    expect(log).toBeTruthy();
  });

  it('单次 reduce(PERFORM_HERO_ATTACK) 入队 1 条 DRAW_CARDS source: backpack（每次攻击都重新跑这一段，保证 fork chain 隐式正确）', () => {
    const weapon = makeWeapon();
    const monster = makeMonster();

    const state = makeState({
      handCards: [],
      backpackItems: [makeBackpackCard('a'), makeBackpackCard('b')],
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        currentTurn: 'hero',
        heroAttacksRemaining: 1,
        engagedMonsterIds: [monster.id],
      },
    });

    const r = reduce(state, {
      type: 'PERFORM_HERO_ATTACK',
      slotId: 'equipmentSlot1',
      targetMonsterId: monster.id,
    } as GameAction);

    const drawActions = (r.enqueuedActions ?? []).filter(a => a.type === 'DRAW_CARDS');
    expect(drawActions.length).toBe(1);
    expect((drawActions[0] as any).source).toBe('backpack');
    expect((drawActions[0] as any).count).toBe(2);
  });

  it('背包为空时仍能正常攻击（DRAW_CARDS 在背包空时 noop，攻击链不卡）', () => {
    const weapon = makeWeapon();
    const monster = makeMonster();

    const state = makeState({
      handCards: [],
      backpackItems: [],
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        currentTurn: 'hero',
        heroAttacksRemaining: 1,
        engagedMonsterIds: [monster.id],
      },
    });

    const r = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: monster.id } as GameAction,
    ]);

    expect(r.state.handCards.length).toBe(0);
    expect(r.state.backpackItems.length).toBe(0);
    expect((r.state.equipmentSlot1 as any)?.durability).toBeLessThan(3);
  });
});

// ---------------------------------------------------------------------------
// 3) Upgrade L0 → L1 → L2
//
// L0: 4 攻 / 3 耐 / drawOnAttack 2
// L1: 4 攻 / 4 耐（+1 maxDur） / drawOnAttack 2（不变）
// L2: 4 攻 / 4 耐（不变） / drawOnAttack 3
// ---------------------------------------------------------------------------

describe('智者之刃 升级 L0 → L1 → L2', () => {
  it('L0 → L1: maxDurability/durability 3/3 → 4/4，drawOnAttack 不变', () => {
    const card = makeWeapon();
    const upgraded = applyUpgrade(card, 1);
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.value).toBe(4);
    expect((upgraded as any).drawOnAttack).toBe(2);
    expect((upgraded as any).knightEffect).toBe('scholar-blade');
    expect(upgraded.description).toBe('每次攻击：从背包抽 2 张牌。');
    expect(upgraded.shortDescription).toBe('每次攻击抽 2 张');
  });

  it('L1 → L2: drawOnAttack 2 → 3，maxDurability/durability 不变', () => {
    const l1 = applyUpgrade(makeWeapon(), 1);
    const l2 = applyUpgrade(l1, 2);
    expect(l2.upgradeLevel).toBe(2);
    expect(l2.maxDurability).toBe(4);
    expect(l2.durability).toBe(4);
    expect(l2.value).toBe(4);
    expect((l2 as any).drawOnAttack).toBe(3);
    expect((l2 as any).knightEffect).toBe('scholar-blade');
    expect(l2.description).toBe('每次攻击：从背包抽 3 张牌。');
    expect(l2.shortDescription).toBe('每次攻击抽 3 张');
  });

  it('L0 → L1 保留 mid-game maxDur 增幅（applyMaxDurabilityDelta preserve+delta）', () => {
    // Mid-game scenario: 玩家先用淬炼药剂把 maxDur 从 3 加到 4（mid-game amp +1），
    // 然后升级到 L1。L1 应该把 maxDur 4 → 5（继续保留 amp），但被
    // DURABILITY_CAP=4 夹回 4 — 这是设计内边界（不会消失，只是已经撞顶了）。
    const amped = { ...makeWeapon(), durability: 4, maxDurability: 4 };
    const l1 = applyUpgrade(amped, 1);
    expect(l1.maxDurability).toBe(4);
    expect(l1.durability).toBe(4);
    expect((l1 as any).drawOnAttack).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4) L2 attack — 端到端确认抽 3 张
// ---------------------------------------------------------------------------

describe('智者之刃 L2 攻击 — PERFORM_HERO_ATTACK 路径', () => {
  it('L2 攻击一次：从背包抽 3 张牌进手牌', () => {
    const l2 = applyUpgrade(applyUpgrade(makeWeapon(), 1), 2);
    const monster = makeMonster();
    const bp1 = makeBackpackCard('bp-1');
    const bp2 = makeBackpackCard('bp-2');
    const bp3 = makeBackpackCard('bp-3');

    const state = makeState({
      handCards: [],
      backpackItems: [bp1, bp2, bp3],
      equipmentSlot1: l2 as any,
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
      combatState: {
        ...initialCombatState,
        currentTurn: 'hero',
        heroAttacksRemaining: 1,
        engagedMonsterIds: [monster.id],
      },
    });

    const r = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: monster.id } as GameAction,
    ]);

    expect(r.state.handCards.length).toBe(3);
    expect(r.state.backpackItems.length).toBe(0);

    const log = r.sideEffects.find(e =>
      e.event === 'log:entry'
      && (e.payload as any)?.message?.includes('智者之刃 攻击：从背包抽 3 张牌'),
    );
    expect(log).toBeTruthy();
  });
});
