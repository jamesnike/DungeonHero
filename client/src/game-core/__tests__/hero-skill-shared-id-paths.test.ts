/**
 * Hero skill ID = Eternal relic ID 共享 passive 触发路径全覆盖测试
 *
 * 背景：4 个 hero skill ID（`waterfall-heal` / `discard-profit` / `summon-minion`
 * / `heal-to-damage`）跟同名的永恒护符 ID 故意复用——表达「同一个被动效果」。
 * 玩家可以通过 3 条独立路径拥有：
 *
 *   1. 开局选 → `state.selectedHeroSkill === id`
 *   2. Shop 三选一买 → `state.extraHeroSkills.includes(id)`
 *   3. 跨存档永恒护符 → `state.eternalRelics.some(r => r.id === id)`
 *
 * 历史 bug：每个触发点只查了部分路径，导致 shop 买的英雄技能完全哑火。
 *   - `waterfall-heal`：只查 eternalRelics → 开局选 + shop 买都没用
 *   - `discard-profit`：只查 eternalRelics → 开局选 + shop 买都没用
 *   - `summon-minion`：查了 selectedHeroSkill + eternalRelics → shop 买没用
 *   - `heal-to-damage`：查了 selectedHeroSkill + eternalRelics → shop 买没用
 *
 * 修复后：所有触发点统一走 `hasPassiveSkillOrRelic` helper，3 路径任一命中都触发。
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { GameAction } from '../actions';
import type { EternalRelic } from '../types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    hp: 10,
    permanentMaxHpBonus: 40,
    ...overrides,
  };
}

const waterfallHealRelic: EternalRelic = {
  id: 'waterfall-heal',
  name: '永恒护符·潮涌回春',
  description: '',
  image: '',
};

const discardProfitRelic: EternalRelic = {
  id: 'discard-profit',
  name: '永恒护符·弃牌生金',
  description: '',
  image: '',
};

const summonMinionRelic: EternalRelic = {
  id: 'summon-minion',
  name: '永恒护符·随从召唤',
  description: '',
  image: '',
};

const healToDamageRelic: EternalRelic = {
  id: 'heal-to-damage',
  name: '永恒护符·愈战愈勇',
  description: '',
  image: '',
};

// ---------------------------------------------------------------------------
// waterfall-heal: 瀑流推进 → +4 HP（被治疗护符 2^N 倍乘）
// ---------------------------------------------------------------------------
describe('waterfall-heal hero skill / relic — all 3 acquisition paths trigger heal', () => {
  it('eternal relic only → +4 HP', () => {
    const state = makeState({
      eternalRelics: [waterfallHealRelic],
    });
    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);
    expect(result.state.hp).toBe(14);
  });

  it('selectedHeroSkill (开局选) only → +4 HP', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: 'waterfall-heal',
    });
    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);
    expect(result.state.hp).toBe(14);
  });

  it('extraHeroSkills (shop 买) only → +4 HP — 这条曾是 user 报告的 bug', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: ['waterfall-heal'],
    });
    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);
    expect(result.state.hp).toBe(14);
  });

  it('OR 语义：同时拥有 relic + skill 不叠加（仍只 +4）', () => {
    const state = makeState({
      eternalRelics: [waterfallHealRelic],
      extraHeroSkills: ['waterfall-heal'],
    });
    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);
    // 只触发一次，不是 8（+4+4）
    expect(result.state.hp).toBe(14);
  });

  it('none → no heal', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: [],
    });
    const result = drain(state, [{ type: 'APPLY_WATERFALL_EFFECTS' } as GameAction]);
    expect(result.state.hp).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// discard-profit: 弃回一张牌 → +2 金币
// ---------------------------------------------------------------------------
describe('discard-profit hero skill / relic — all 3 acquisition paths trigger gold', () => {
  function makeDiscardCard(id = 'card-to-discard'): GameCardData {
    return {
      id,
      type: 'magic',
      name: '测试卡',
      value: 0,
      image: '',
    } as GameCardData;
  }

  it('eternal relic only → +2 gold per discard', () => {
    const state = makeState({
      eternalRelics: [discardProfitRelic],
      gold: 5,
    });
    const card = makeDiscardCard();
    const result = drain(state, [
      { type: 'DISCARD_OWNED_CARD', card, owner: 'player' } as GameAction,
    ]);
    expect(result.state.gold).toBe(7);
  });

  it('selectedHeroSkill (开局选) only → +2 gold', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: 'discard-profit',
      gold: 5,
    });
    const card = makeDiscardCard();
    const result = drain(state, [
      { type: 'DISCARD_OWNED_CARD', card, owner: 'player' } as GameAction,
    ]);
    expect(result.state.gold).toBe(7);
  });

  it('extraHeroSkills (shop 买) only → +2 gold — 同款 bug', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: ['discard-profit'],
      gold: 5,
    });
    const card = makeDiscardCard();
    const result = drain(state, [
      { type: 'DISCARD_OWNED_CARD', card, owner: 'player' } as GameAction,
    ]);
    expect(result.state.gold).toBe(7);
  });

  it('OR 语义：relic + skill 同时拥有不叠加（仍只 +2）', () => {
    const state = makeState({
      eternalRelics: [discardProfitRelic],
      extraHeroSkills: ['discard-profit'],
      gold: 5,
    });
    const card = makeDiscardCard();
    const result = drain(state, [
      { type: 'DISCARD_OWNED_CARD', card, owner: 'player' } as GameAction,
    ]);
    expect(result.state.gold).toBe(7);
  });

  it('none → no gold gain', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: [],
      gold: 5,
    });
    const card = makeDiscardCard();
    const result = drain(state, [
      { type: 'DISCARD_OWNED_CARD', card, owner: 'player' } as GameAction,
    ]);
    expect(result.state.gold).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// summon-minion: 用小随从击杀怪物 → 小随从 +1/+1
// ---------------------------------------------------------------------------
describe('summon-minion hero skill / relic — all 3 acquisition paths trigger minion buff', () => {
  function makeMinion(): GameCardData {
    return {
      id: 'minion-1',
      type: 'monster' as const,
      name: '小随从',
      value: 1,
      attack: 1,
      hp: 1,
      maxHp: 1,
      image: '',
      isMinionCard: true,
    } as GameCardData;
  }
  function makeDeadMonster(): GameCardData {
    return {
      id: 'dead-1',
      type: 'monster' as const,
      name: '小怪',
      value: 1,
      attack: 1,
      hp: 0,
      maxHp: 5,
      image: '',
    } as GameCardData;
  }

  function runDefeat(state: GameState) {
    const monster = makeDeadMonster();
    const stateWithMonster = {
      ...state,
      activeCards: [monster, null, null, null, null] as any,
      combatState: { ...state.combatState, engagedMonsterIds: [monster.id] },
    };
    return reduce(stateWithMonster, {
      type: 'MONSTER_DEFEATED',
      monsterId: monster.id,
      killedByMinion: true,
      source: 'minion',
    } as GameAction);
  }

  it('eternal relic only → minion +1/+1', () => {
    const state = makeState({
      eternalRelics: [summonMinionRelic],
      backpackItems: [makeMinion()] as any,
    });
    const { state: next } = runDefeat(state);
    const buffed = next.backpackItems.find(c => c.id === 'minion-1');
    expect(buffed?.attack).toBe(2);
    expect(buffed?.hp).toBe(2);
  });

  it('selectedHeroSkill (开局选) only → minion +1/+1', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: 'summon-minion',
      backpackItems: [makeMinion()] as any,
    });
    const { state: next } = runDefeat(state);
    const buffed = next.backpackItems.find(c => c.id === 'minion-1');
    expect(buffed?.attack).toBe(2);
    expect(buffed?.hp).toBe(2);
  });

  it('extraHeroSkills (shop 买) only → minion +1/+1 — 同款 bug', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: ['summon-minion'],
      backpackItems: [makeMinion()] as any,
    });
    const { state: next } = runDefeat(state);
    const buffed = next.backpackItems.find(c => c.id === 'minion-1');
    expect(buffed?.attack).toBe(2);
    expect(buffed?.hp).toBe(2);
  });

  it('none → no buff', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: [],
      backpackItems: [makeMinion()] as any,
    });
    const { state: next } = runDefeat(state);
    const unchanged = next.backpackItems.find(c => c.id === 'minion-1');
    expect(unchanged?.attack).toBe(1);
    expect(unchanged?.hp).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// heal-to-damage: 累积治疗 5 HP → 左右装备栏永久 +1 伤害
// ---------------------------------------------------------------------------
describe('heal-to-damage hero skill / relic — all 3 acquisition paths trigger damage gain', () => {
  it('eternal relic only → 治疗 5 后两栏永久 +1 伤害', () => {
    const state = makeState({
      eternalRelics: [healToDamageRelic],
      hp: 10,
      healAccumulator: 0,
    });
    const result = drain(state, [
      { type: 'HEAL', amount: 5, source: 'test' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(1);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(1);
  });

  it('selectedHeroSkill (开局选) only → +1/+1 damage', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: 'heal-to-damage',
      hp: 10,
      healAccumulator: 0,
    });
    const result = drain(state, [
      { type: 'HEAL', amount: 5, source: 'test' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(1);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(1);
  });

  it('extraHeroSkills (shop 买) only → +1/+1 damage — 同款 bug', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: ['heal-to-damage'],
      hp: 10,
      healAccumulator: 0,
    });
    const result = drain(state, [
      { type: 'HEAL', amount: 5, source: 'test' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(1);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(1);
  });

  it('none → no damage gain', () => {
    const state = makeState({
      eternalRelics: [],
      selectedHeroSkill: null,
      extraHeroSkills: [],
      hp: 10,
      healAccumulator: 0,
    });
    const result = drain(state, [
      { type: 'HEAL', amount: 5, source: 'test' } as GameAction,
    ]);
    expect(result.state.equipmentSlotBonuses.equipmentSlot1.damage).toBe(0);
    expect(result.state.equipmentSlotBonuses.equipmentSlot2.damage).toBe(0);
  });
});
