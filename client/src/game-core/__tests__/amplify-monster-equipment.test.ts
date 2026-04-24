/**
 * Monster equipment amplify — `+1 攻击 / +1 HP` 按卡名全场传染。
 *
 * 背景：amplify（增幅 / 增幅秘药）原本只支持 weapon / shield / 伤害 magic。
 * monster 装备（说服怪物 / 怪物以装备形态进背包）历史上无法被选作目标，
 * 且 `applyAmplifyToCard` 的 monster 分支只 bump `value`、不动显式的
 * `attack` / `hp`，等于完全无效。
 *
 * 本测试覆盖修复后的语义：
 *   1. `applyAmplifyToCard(monster, 1)` 同时 bump
 *      attack / baseAttack / hp / maxHp / baseHp / value / amplifyBonus。
 *   2. `AMPLIFY_CARDS_BY_NAME` 把 +1/+1 同步到所有 zone 的同名怪物
 *      （装备栏 / 背包 / active row / 坟场）。
 *   3. `applyAmplifyOnCreate` 让后续生成的同名怪物自动继承累计 +1/+1。
 *   4. Echo（`echoMultiplier=2`）下 +2/+2。
 *
 * fixture 用 `phase: 'playerInput'` 走真实 dispatch 链，符合
 * `pipeline-input-continuation.mdc` 的要求。
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { applyAmplifyToCard, applyAmplifyOnCreate } from '../helpers';
import type { GameState } from '../types';
import type { GameAction, GameCardData } from '../actions';
import type { EquipmentItem } from '@/components/game-board/types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeGoblin(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'goblin-1',
    type: 'monster',
    name: 'Goblin',
    monsterType: 'Goblin',
    value: 3,
    attack: 3,
    baseAttack: 3,
    hp: 4,
    maxHp: 4,
    baseHp: 4,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    rageTurn: 10,
    ...over,
  } as GameCardData;
}

function makeAmplifyPermCard(targetName: string, opts: { id?: string } = {}): GameCardData {
  return {
    id: opts.id ?? 'amp-perm-monster',
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

describe('Monster equipment amplify', () => {
  describe('applyAmplifyToCard helper — monster 分支', () => {
    it('+1 同时 bump attack / baseAttack / hp / maxHp / baseHp / value / amplifyBonus', () => {
      const goblin = makeGoblin();
      const amped = applyAmplifyToCard(goblin, 1);

      expect(amped.attack).toBe(4);
      expect(amped.baseAttack).toBe(4);
      expect(amped.hp).toBe(5);
      expect(amped.maxHp).toBe(5);
      expect(amped.baseHp).toBe(5);
      expect(amped.value).toBe(4);
      expect(amped.amplifyBonus).toBe(1);
    });

    it('+2 在已有 amplifyBonus=1 的卡上累加（最终 amplifyBonus=3）', () => {
      const goblin = makeGoblin({ amplifyBonus: 1, attack: 4, baseAttack: 4, hp: 5, maxHp: 5, baseHp: 5, value: 4 });
      const amped = applyAmplifyToCard(goblin, 2);

      expect(amped.attack).toBe(6);
      expect(amped.baseAttack).toBe(6);
      expect(amped.hp).toBe(7);
      expect(amped.maxHp).toBe(7);
      expect(amped.baseHp).toBe(7);
      expect(amped.amplifyBonus).toBe(3);
    });

    it('amount=0 时返回原卡引用（不可变更新短路）', () => {
      const goblin = makeGoblin();
      const result = applyAmplifyToCard(goblin, 0);
      expect(result).toBe(goblin);
    });
  });

  describe('AMPLIFY_CARDS_BY_NAME — 全场同名怪物按 name 传染', () => {
    it('装备栏 + 背包 + active row + 坟场的同名怪物全部 +1/+1，不同名怪物不动', () => {
      const equippedGoblin = makeGoblin({ id: 'eq-goblin' });
      const backpackGoblin = makeGoblin({ id: 'bp-goblin' });
      const activeGoblin = makeGoblin({ id: 'ar-goblin' });
      const graveGoblin = makeGoblin({ id: 'gy-goblin' });
      const otherMonster = makeGoblin({ id: 'orc-1', name: 'Orc', monsterType: 'Orc' });
      const ampPerm = makeAmplifyPermCard('Goblin');

      const state = makeState({
        equipmentSlot1: equippedGoblin as EquipmentItem,
        backpackItems: [backpackGoblin] as any,
        activeCards: [activeGoblin, otherMonster, null] as any,
        discardedCards: [graveGoblin] as any,
      });

      const drained = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
      ]);

      expect(drained.state.amplifiedCardBonus['Goblin']).toBe(1);

      const eq = drained.state.equipmentSlot1 as GameCardData | null;
      expect(eq?.attack).toBe(4);
      expect(eq?.hp).toBe(5);
      expect(eq?.amplifyBonus).toBe(1);

      const bp = drained.state.backpackItems.find(c => c.id === 'bp-goblin');
      expect(bp?.attack).toBe(4);
      expect(bp?.hp).toBe(5);

      const ar = drained.state.activeCards.find(c => c?.id === 'ar-goblin');
      expect(ar?.attack).toBe(4);
      expect(ar?.hp).toBe(5);

      const gy = drained.state.discardedCards.find(c => c.id === 'gy-goblin');
      expect(gy?.attack).toBe(4);
      expect(gy?.hp).toBe(5);

      // 不同名怪物未受影响
      const orc = drained.state.activeCards.find(c => c?.id === 'orc-1');
      expect(orc?.attack).toBe(3);
      expect(orc?.hp).toBe(4);
      expect(orc?.amplifyBonus ?? 0).toBe(0);
    });

    it('累计：连续两次「增幅：Goblin」→ amplifiedCardBonus=2，现存同名怪物 attack=5 / hp=6', () => {
      const equippedGoblin = makeGoblin({ id: 'eq-goblin' });
      const ampPerm1 = makeAmplifyPermCard('Goblin', { id: 'amp-1' });
      const ampPerm2 = makeAmplifyPermCard('Goblin', { id: 'amp-2' });

      const state = makeState({
        equipmentSlot1: equippedGoblin as EquipmentItem,
      });

      const drained = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: ampPerm1.id, card: ampPerm1 } as GameAction,
        { type: 'RESOLVE_MAGIC', cardId: ampPerm2.id, card: ampPerm2 } as GameAction,
      ]);

      expect(drained.state.amplifiedCardBonus['Goblin']).toBe(2);
      const eq = drained.state.equipmentSlot1 as GameCardData | null;
      expect(eq?.attack).toBe(5);
      expect(eq?.hp).toBe(6);
      expect(eq?.amplifyBonus).toBe(2);
    });
  });

  describe('applyAmplifyOnCreate — 后续生成的同名怪物自动继承', () => {
    it('amplifiedCardBonus map 中已有 Goblin=1 时，新生成的 Goblin 工厂卡 attack/hp +1', () => {
      const fresh = makeGoblin({ id: 'new-goblin' });
      const result = applyAmplifyOnCreate(fresh, { Goblin: 1 });
      expect(result.attack).toBe(4);
      expect(result.hp).toBe(5);
      expect(result.amplifyBonus).toBe(1);
    });

    it('map 不含该名时返回原卡引用', () => {
      const fresh = makeGoblin({ id: 'new-goblin' });
      const result = applyAmplifyOnCreate(fresh, { Orc: 5 });
      expect(result).toBe(fresh);
    });
  });

  describe('Echo（双倍下次魔法）', () => {
    it('doubleNextMagic=true → 「增幅：Goblin」一次给 +2/+2', () => {
      const equippedGoblin = makeGoblin({ id: 'eq-goblin' });
      const ampPerm = makeAmplifyPermCard('Goblin');

      const state = makeState({
        equipmentSlot1: equippedGoblin as EquipmentItem,
        doubleNextMagic: true,
      });

      const drained = drain(state, [
        { type: 'RESOLVE_MAGIC', cardId: ampPerm.id, card: ampPerm } as GameAction,
      ]);

      expect(drained.state.amplifiedCardBonus['Goblin']).toBe(2);
      const eq = drained.state.equipmentSlot1 as GameCardData | null;
      expect(eq?.attack).toBe(5);
      expect(eq?.baseAttack).toBe(5);
      expect(eq?.hp).toBe(6);
      expect(eq?.maxHp).toBe(6);
      expect(eq?.baseHp).toBe(6);
      expect(eq?.amplifyBonus).toBe(2);
    });
  });
});
