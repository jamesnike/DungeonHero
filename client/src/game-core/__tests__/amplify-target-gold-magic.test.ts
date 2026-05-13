/**
 * 「增幅」目标扩展到金币魔法 — 赌徒之计 / 运势博弈 / 血金术
 *
 * 三张「金币增益」魔法卡新加入「可增幅」白名单：
 *   - 赌徒之计 (gambler-gambit, starter perm)
 *   - 运势博弈 (deck-top-swap-gold, starter perm)
 *   - 血金术 (guild-blood-gold, event-token perm)
 *
 * 增幅语义（与 isGoldGrantMagic / computeDamageMagicDisplayPure 同口径）：
 *   每层增幅 → 该卡可获得的金币 +1。
 *   运势博弈仅作用于「同类型奖励 +10/+15」分支；-1 惩罚不变。
 *
 * 本测试覆盖：
 *   1. isDamageMagic / isGoldGrantMagic 把这 3 张卡识别为可增幅目标
 *   2. computeDamageMagicDisplayPure 动态显示包含 amp
 *   3. RESOLVE_MAGIC 走完 PLAY → MODIFY_GOLD 的端到端：amp 真的 +1 金币
 *   4. 回响 ×2 + 增幅复合：(base+amp) × echoMultiplier
 *   5. 「增幅」magic resolver 现在能在手牌中找到这 3 张卡作为目标
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { STARTER_CARD_IDS } from '../deck';
import {
  isDamageMagic,
  isGoldGrantMagic,
  computeDamageMagicDisplayPure,
} from '../helpers';
import type { GameState } from '../types';
import type { GameAction, GameCardData } from '../actions';
import '../card-schema'; // register all card definitions

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] } as any,
    ...overrides,
  };
}

function pickSuffix(n: number): string {
  return `-pick-${n}`;
}

function makeGamblerGambit(suffix = '', upgradeLevel = 0, amplifyBonus = 0): GameCardData {
  return {
    id: `${STARTER_CARD_IDS.gamblerGambit}${suffix}`,
    type: 'magic',
    name: '赌徒之计',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 1,
    maxUpgradeLevel: 2,
    upgradeLevel,
    amplifyBonus: amplifyBonus || undefined,
  } as GameCardData;
}

function makeDeckSwapCard(suffix = '', upgradeLevel = 0, amplifyBonus = 0): GameCardData {
  return {
    id: `${STARTER_CARD_IDS.deckTopSwapGold}${suffix}`,
    type: 'magic',
    name: '运势博弈',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: 'test',
    recycleDelay: 2,
    maxUpgradeLevel: 1,
    upgradeLevel,
    amplifyBonus: amplifyBonus || undefined,
  } as GameCardData;
}

// Mirror production: events.ts `guildFlipToMagic` creates the card with
// id: 'guild-blood-gold' + NO magicEffect (the description goes in the
// `description` / `shortDescription` fields, NOT in magicEffect — see
// events.ts comment). Schema routing goes through the `card:${name}`
// fallback chain (registry.ts:35) since `resolveEffectId` returns
// `starter:guild-blood-gold` (unregistered) → fallback → `card:血金术` (the
// effectId we register starterGuildBloodGold under).
//
// `id` may receive a suffix like `-evt-1-xxx`; the `card:${name}` fallback
// is name-driven so suffixes don't matter.
function makeGuildBloodGold(idSuffix = '', amplifyBonus = 0): GameCardData {
  return {
    id: idSuffix ? `guild-blood-gold${idSuffix}` : 'guild-blood-gold',
    type: 'magic',
    name: '血金术',
    value: 0,
    image: '',
    magicType: 'permanent',
    description: '以鲜血换取黄金，奇术商会的禁忌手段。',
    shortDescription: '-1 生命；+3 金币',
    recycleDelay: 1,
    amplifyBonus: amplifyBonus || undefined,
  } as GameCardData;
}

function makeMonster(id: string, hp = 5, attack = 1): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 1,
    image: '',
    hp,
    maxHp: hp,
    attack,
  } as GameCardData;
}

function makePotion(id: string): GameCardData {
  return {
    id,
    type: 'potion',
    name: '小药水',
    value: 1,
    image: '',
    potionEffect: 'heal',
  } as GameCardData;
}

function makeAmplifyPermCard(targetName: string, opts: { id?: string } = {}): GameCardData {
  return {
    id: opts.id ?? 'amp-perm-1',
    type: 'magic',
    name: `增幅：${targetName}`,
    value: 0,
    magicType: 'permanent',
    magicEffect: 'amplify-target',
    description: `永久魔法（Perm 1）：对「${targetName}」进行增幅。`,
    recycleDelay: 1,
    _amplifyTargetName: targetName,
  } as GameCardData;
}

const baseDisplayState = { hp: 20, maxHp: 20, gold: 0, stunCap: 0, backpackCount: 0, recycleBagCount: 0 };

describe('isGoldGrantMagic — recognizes 3 gold-grant magic cards as amplifiable', () => {
  it('赌徒之计 / 运势博弈 / 血金术 all return true', () => {
    expect(isGoldGrantMagic(makeGamblerGambit(pickSuffix(1)))).toBe(true);
    expect(isGoldGrantMagic(makeDeckSwapCard(pickSuffix(2)))).toBe(true);
    expect(isGoldGrantMagic(makeGuildBloodGold('-evt-1'))).toBe(true);
  });

  it('其它 magic 卡（非金币系）返回 false', () => {
    const heal: GameCardData = {
      id: 'h-heal-1', type: 'magic', name: '治愈术', value: 5,
      magicType: 'instant',
    } as GameCardData;
    expect(isGoldGrantMagic(heal)).toBe(false);
    expect(isGoldGrantMagic({ ...heal, type: 'weapon' as any })).toBe(false);
  });

  it('isGoldGrantMagic 与 isDamageMagic 是独立维度（治愈术既不是伤害魔法也不是金币魔法）', () => {
    const heal: GameCardData = {
      id: 'h-heal-1', type: 'magic', name: '治愈术', value: 5,
      magicType: 'instant',
    } as GameCardData;
    expect(isDamageMagic(heal)).toBe(false);
    expect(isGoldGrantMagic(heal)).toBe(false);
  });
});

describe('computeDamageMagicDisplayPure — 金币魔法动态显示', () => {
  it('赌徒之计 L0：amp 0 → "获得 1 金币"，amp 1 → "获得 2 金币"，amp 3 → "获得 4 金币"', () => {
    const card0 = makeGamblerGambit(pickSuffix(1), 0, 0);
    const d0 = computeDamageMagicDisplayPure(card0, baseDisplayState);
    expect(d0?.mode).toBe('replace');
    expect((d0 as any).text).toContain('获得 1 金币');

    const card1 = makeGamblerGambit(pickSuffix(2), 0, 1);
    const d1 = computeDamageMagicDisplayPure(card1, baseDisplayState);
    expect((d1 as any).text).toContain('获得 2 金币');

    const card3 = makeGamblerGambit(pickSuffix(3), 0, 3);
    const d3 = computeDamageMagicDisplayPure(card3, baseDisplayState);
    expect((d3 as any).text).toContain('获得 4 金币');
  });

  it('赌徒之计 L1 amp 2 → "获得 4 金币"（base 2 + amp 2）', () => {
    const card = makeGamblerGambit(pickSuffix(4), 1, 2);
    const d = computeDamageMagicDisplayPure(card, baseDisplayState);
    expect((d as any).text).toContain('获得 4 金币');
  });

  it('运势博弈 L0 amp 1 → "+11 金币"（同类型分支）', () => {
    const card = makeDeckSwapCard(pickSuffix(5), 0, 1);
    const d = computeDamageMagicDisplayPure(card, baseDisplayState);
    expect((d as any).text).toContain('+11 金币');
    // -1 惩罚不变（描述里仍写 -1）
    expect((d as any).text).toContain('-1 金币');
  });

  it('运势博弈 L1 amp 5 → "+20 金币"（base 15 + amp 5）', () => {
    const card = makeDeckSwapCard(pickSuffix(6), 1, 5);
    const d = computeDamageMagicDisplayPure(card, baseDisplayState);
    expect((d as any).text).toContain('+20 金币');
  });

  it('血金术 amp 2 → "获得 5 金币"（base 3 + amp 2）', () => {
    const card = makeGuildBloodGold('-evt-2', 2);
    const d = computeDamageMagicDisplayPure(card, baseDisplayState);
    expect((d as any).text).toContain('获得 5 金币');
  });
});

// ---------------------------------------------------------------------------
// 端到端：PLAY_CARD → drain → 检查 gold 状态
// ---------------------------------------------------------------------------

describe('赌徒之计 (gambler-gambit) — amplifyBonus → +1 金币 per amp', () => {
  it('amp 0：原始 +1 金币（L0 baseline）', () => {
    const card = makeGamblerGambit(pickSuffix(11), 0, 0);
    const bp = makePotion('bp-1');
    const state = makeState({ handCards: [card], backpackItems: [bp] as any, gold: 50, hp: 20 });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(51);
  });

  it('amp 1：+2 金币', () => {
    const card = makeGamblerGambit(pickSuffix(12), 0, 1);
    const bp = makePotion('bp-1');
    const state = makeState({ handCards: [card], backpackItems: [bp] as any, gold: 50, hp: 20 });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(52);
  });

  it('amp 3 + L1：+5 金币（base 2 + amp 3）', () => {
    const card = makeGamblerGambit(pickSuffix(13), 1, 3);
    const bp = makePotion('bp-1');
    const state = makeState({ handCards: [card], backpackItems: [bp] as any, gold: 50, hp: 20 });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(55);
  });

  it('回响 ×2 + amp 2：(1 + 2) × 2 = +6 金币（L0）', () => {
    const card = makeGamblerGambit(pickSuffix(14), 0, 2);
    const bp = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp] as any,
      gold: 50,
      hp: 20,
      doubleNextMagic: true,
    } as Partial<GameState>);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(56);
  });
});

describe('血金术 (guild-blood-gold) — amplifyBonus → +1 金币 per amp', () => {
  it('amp 0：原始 +3 金币 / -1 HP', () => {
    const card = makeGuildBloodGold('-evt-1', 0);
    const state = makeState({ handCards: [card], gold: 50, hp: 20 });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(53);
    expect(result.state.hp).toBe(19);
  });

  it('amp 2：+5 金币 / -1 HP（伤害不变）', () => {
    const card = makeGuildBloodGold('-evt-2', 2);
    const state = makeState({ handCards: [card], gold: 50, hp: 20 });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(55);
    expect(result.state.hp).toBe(19);
  });

  it('回响 ×2 + amp 1：(3 + 1) × 2 = +8 金币 / -2 HP', () => {
    const card = makeGuildBloodGold('-evt-3', 1);
    const state = makeState({
      handCards: [card],
      gold: 50,
      hp: 20,
      doubleNextMagic: true,
    } as Partial<GameState>);
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(result.state.gold).toBe(58);
    expect(result.state.hp).toBe(18);
  });
});

describe('运势博弈 (deck-top-swap-gold) — amplifyBonus 仅作用于同类型奖励分支', () => {
  it('amp 1 + 同类型（怪 vs 怪）→ +11 金币（base 10 + amp 1）', () => {
    const card = makeDeckSwapCard(pickSuffix(21), 0, 1);
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 7);
    const bp = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2] as any,
      gold: 50,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.gold).toBe(61);
  });

  it('amp 5 + L1 同类型 → +20 金币（base 15 + amp 5）', () => {
    const card = makeDeckSwapCard(pickSuffix(22), 1, 5);
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 7);
    const bp = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2] as any,
      gold: 50,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.gold).toBe(70);
  });

  it('amp 3 + 不同类型（怪 vs 药水）→ -1 金币（惩罚分支不吃 amp）', () => {
    const card = makeDeckSwapCard(pickSuffix(23), 0, 3);
    const m1 = makeMonster('m1');
    const potion = makePotion('p-top');
    const bp = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [potion] as any,
      gold: 50,
    });
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.gold).toBe(49); // -1 惩罚不变
  });

  it('回响 ×2 + amp 2 + 两轮同类型：each round +12，总 +24 = 74', () => {
    const card = makeDeckSwapCard(pickSuffix(24), 0, 2);
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 6);
    const m3 = makeMonster('m3', 7);
    const bp1 = makePotion('bp-1');
    const bp2 = makePotion('bp-2');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp1, bp2] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2, m3] as any,
      gold: 50,
      doubleNextMagic: true,
    } as Partial<GameState>);
    let result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm2' } as GameAction,
    ]);
    expect(result.state.gold).toBe(74);
  });
});

// ---------------------------------------------------------------------------
// 「增幅」magic resolver 整合：手牌中的 3 张金币卡作为目标
// ---------------------------------------------------------------------------

describe('「增幅：XX」(amplify-target) end-to-end on gold magics', () => {
  it('「增幅：赌徒之计」+1 amplifyBonus → 手牌中的赌徒之计 amplifyBonus 累加', () => {
    const gambler = makeGamblerGambit(pickSuffix(31));
    const ampPerm = makeAmplifyPermCard('赌徒之计', { id: 'amp-perm-gam' });
    const state = makeState({ handCards: [gambler] as any });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['赌徒之计']).toBe(1);
    const updated = drained.state.handCards.find(c => c.name === '赌徒之计');
    expect((updated as any)?.amplifyBonus).toBe(1);
  });

  it('「增幅：血金术」+1 → 手牌中的血金术 amplifyBonus 累加', () => {
    const blood = makeGuildBloodGold('-evt-31');
    const ampPerm = makeAmplifyPermCard('血金术', { id: 'amp-perm-blood' });
    const state = makeState({ handCards: [blood] as any });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['血金术']).toBe(1);
    const updated = drained.state.handCards.find(c => c.name === '血金术');
    expect((updated as any)?.amplifyBonus).toBe(1);
  });

  it('「增幅：运势博弈」+1 → 手牌中的运势博弈 amplifyBonus 累加', () => {
    const swap = makeDeckSwapCard(pickSuffix(33));
    const ampPerm = makeAmplifyPermCard('运势博弈', { id: 'amp-perm-swap' });
    const state = makeState({ handCards: [swap] as any });

    const drained = drain(state, [
      { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
    ]);

    expect(drained.state.amplifiedCardBonus['运势博弈']).toBe(1);
    const updated = drained.state.handCards.find(c => c.name === '运势博弈');
    expect((updated as any)?.amplifyBonus).toBe(1);
  });

  it('REGRESSION: 「增幅」magic 现在能在手牌中检测到 3 张金币魔法（之前会报「无可增幅目标」）', () => {
    // amplifyCard schema resolver 早退检查：当 hand 没有任何 weapon/shield/damageMagic/goldMagic 时，
    // 直接 banner "增幅：没有可增幅的目标..."。新加 isGoldGrantMagic 之后，赌徒之计应能通过这个检查。
    const ampSource: GameCardData = {
      id: 'amp-src-1',
      type: 'magic',
      name: '增幅',
      value: 0,
      magicType: 'instant',
      magicEffect: 'amplify-card',
    } as GameCardData;
    const gambler = makeGamblerGambit(pickSuffix(34));
    const state = makeState({
      handCards: [ampSource, gambler] as any,
      equipmentSlot1: null,
      equipmentSlot2: null,
    });

    const result = reduce(state, {
      type: 'RESOLVE_MAGIC',
      cardId: ampSource.id,
      card: ampSource,
    } as GameAction);

    // 新行为：能找到金币魔法 → 打开 amplifyModal
    expect(result.state.amplifyModal).not.toBeNull();
    // 旧行为下 banner 会包含「没有可增幅的目标」；新版应不出现该 banner
    const noTargetBanner = result.sideEffects.find(
      s => s.event === 'banner:show' && (s.payload as any)?.message?.includes('没有可增幅的目标'),
    );
    expect(noTargetBanner).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UPGRADE × AMPLIFY 复合：升级后 amplifyBonus 必须保留
//
// 原理：cardUpgrade.ts:applyUpgrade 用 `{ ...card, upgradeLevel: newLevel }`
// 拷贝原卡，amplifyBonus 通过 spread 自动保留；on-upgrade 处理器（赌徒之计 /
// 运势博弈 都注册成 noopUpgrade）不会动这个字段；computeCardText 只覆盖
// description / shortDescription / magicEffect。所以升级 IS 应该保留 amp。
//
// 这条测试是 REGRESSION：防止以后有人误改 applyUpgrade 把 amp 重置 / 让
// formatter 在 description 里把 amp 直接 bake 进文案 / 等等。
// ---------------------------------------------------------------------------

describe('UPGRADE preserves amplifyBonus — 升级保留之前的增幅层数', () => {
  it('赌徒之计 amp=2 → upgrade L0→L1：amplifyBonus 仍然是 2，最终 +(2+2)=4 金币', () => {
    const card = makeGamblerGambit(pickSuffix(40), 0, 2);
    const state = makeState({ handCards: [card], gold: 50, hp: 20 });

    const upgraded = drain(state, [{ type: 'UPGRADE_CARD', cardId: card.id } as GameAction]);
    const inHand = upgraded.state.handCards.find(c => c.id === card.id) as GameCardData;
    expect(inHand?.upgradeLevel).toBe(1);
    expect((inHand as any)?.amplifyBonus).toBe(2); // ← 关键断言：amp 保留

    // 实际打牌验证：L1 base=2 + amp=2 → +4 金币
    const played = drain(upgraded.state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(played.state.gold).toBe(54);
    expect(played.state.hp).toBe(19);
  });

  it('赌徒之计 amp=3 → upgrade L1→L2：amplifyBonus 仍然是 3，最终 +(4+3)=7 金币', () => {
    const card = makeGamblerGambit(pickSuffix(41), 1, 3);
    const state = makeState({ handCards: [card], gold: 50, hp: 20 });

    const upgraded = drain(state, [{ type: 'UPGRADE_CARD', cardId: card.id } as GameAction]);
    const inHand = upgraded.state.handCards.find(c => c.id === card.id) as GameCardData;
    expect(inHand?.upgradeLevel).toBe(2);
    expect((inHand as any)?.amplifyBonus).toBe(3);

    const played = drain(upgraded.state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    expect(played.state.gold).toBe(57);
    expect(played.state.hp).toBe(19);
  });

  it('运势博弈 amp=4 → upgrade L0→L1：amplifyBonus 仍然是 4，同类型分支 +(15+4)=19 金币', () => {
    const card = makeDeckSwapCard(pickSuffix(42), 0, 4);
    const m1 = makeMonster('m1', 5);
    const m2 = makeMonster('m2', 7);
    const bp = makePotion('bp-1');
    const state = makeState({
      handCards: [card],
      backpackItems: [bp] as any,
      activeCards: [m1, null, null, null, null] as any,
      remainingDeck: [m2] as any,
      gold: 50,
    });

    const upgraded = drain(state, [{ type: 'UPGRADE_CARD', cardId: card.id } as GameAction]);
    const inHand = upgraded.state.handCards.find(c => c.id === card.id) as GameCardData;
    expect(inHand?.upgradeLevel).toBe(1);
    expect((inHand as any)?.amplifyBonus).toBe(4);

    let result = drain(upgraded.state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    result = drain(result.state, [
      { type: 'RESOLVE_DUNGEON_CARD_SELECTION', cardId: 'm1' } as GameAction,
    ]);
    expect(result.state.gold).toBe(69); // 50 + (15 + 4) = 69
  });

  it('UI 显示也跟着升级 + amp 同步：赌徒之计 L0/amp=2 升到 L1/amp=2 → "获得 4 金币"', () => {
    const before = makeGamblerGambit(pickSuffix(43), 0, 2);
    const dBefore = computeDamageMagicDisplayPure(before, baseDisplayState);
    expect((dBefore as any).text).toContain('获得 3 金币'); // L0 base=1 + amp=2

    const state = makeState({ handCards: [before] });
    const upgraded = drain(state, [{ type: 'UPGRADE_CARD', cardId: before.id } as GameAction]);
    const after = upgraded.state.handCards.find(c => c.id === before.id) as GameCardData;
    const dAfter = computeDamageMagicDisplayPure(after, baseDisplayState);
    expect((dAfter as any).text).toContain('获得 4 金币'); // L1 base=2 + amp=2
    expect((dAfter as any).amplifyBonus).toBe(2);
  });
});
