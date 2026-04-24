/**
 * Repro: 杀死 monster 后，monster 卡牌在 staging 状态（defeatProcessed=true 还在 active row 上，
 * 战利品弹窗已开），点击 撤销 → monster 卡牌应该恢复成"活的"状态（无 defeatProcessed），
 * 不应继续显示灰色。
 *
 * 用户报告：杀死 monster 后点撤销，monster 卡牌还是灰色的。
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../index';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import { arePropsEqual, type GameCardProps } from '@/components/GameCard';
import type { GameState } from '../types';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { reduce } from '../reducer';

function makeMonster(id: string, hp = 3): GameCardData {
  return {
    id, type: 'monster', name: 'Test Monster', monsterType: 'Slime',
    value: 5, attack: 2, hp, maxHp: hp, baseAttack: 2, baseHp: hp,
    fury: 1, hpLayers: 1, currentLayer: 1,
  } as GameCardData;
}

function makeWeapon(): GameCardData {
  return {
    id: 'test-sword', type: 'weapon', name: 'Sword', value: 0,
    attack: 99, durability: 5, maxDurability: 5,
  } as GameCardData;
}

describe('Undo at staging state (monster killed, modal showing)', () => {
  it('after kill + click 撤销 in modal, monster card no longer has defeatProcessed', () => {
    const engine = new GameEngine();
    const monster = makeMonster('mon-A');

    const initial = createInitialGameState();
    let state: GameState = {
      ...initial,
      activeCards: [monster, null, null, null] as (GameCardData | null)[],
      equipmentSlot1: makeWeapon() as any,
      equipmentSlot2: null,
      combatState: { ...initialCombatState, currentTurn: 'hero', engagedMonsterIds: [monster.id] },
      phase: 'playerInput',
    };
    state = reduce(state, { type: 'CACHE_MONSTER_REWARD_PREVIEW', monster }).state;
    (engine as any)._state = state;

    // Step 1: handleWeaponToMonster pushUndoSnapshot S1 (alive monster)
    engine.pushUndoCheckpoint();

    // Step 2: monster dies via DEAL_DAMAGE_TO_MONSTER → MONSTER_DEFEATED
    engine.dispatch({
      type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: 99, source: 'weapon',
    } as GameAction);

    // After kill: monster is in staging state (defeatProcessed=true), modal shows
    const stateAfterKill = engine.getState();
    expect(stateAfterKill.activeCards[0]?.defeatProcessed).toBe(true);
    expect(stateAfterKill.activeMonsterReward).toBeTruthy();

    // Step 3: simulate animation finishing (END_MONSTER_DEFEAT_ANIMATION fires)
    engine.dispatch({ type: 'END_MONSTER_DEFEAT_ANIMATION', monsterId: monster.id } as GameAction);
    expect(engine.getState().monsterDefeatAnimationIds).toEqual([]);

    // Step 4: user clicks 撤销 in the modal → pop S1
    const popped = engine.popUndoCheckpoint();
    expect(popped).toBeTruthy();

    const stateAfterUndo = engine.getState();
    expect(stateAfterUndo.activeCards[0]?.id).toBe(monster.id);
    // ★ This is the key assertion: the monster card on the row must NOT
    //   have defeatProcessed after undo (otherwise card stays gray).
    expect(stateAfterUndo.activeCards[0]?.defeatProcessed).toBeFalsy();
    // Modal should also be closed
    expect(stateAfterUndo.activeMonsterReward).toBeNull();
    // Monster animation flag should also be cleared
    expect(stateAfterUndo.monsterDefeatAnimationIds).toEqual([]);
  });
});

/**
 * The engine state was always restored correctly by `popUndoCheckpoint`, but
 * the user-reported "card stays gray after undo" bug was actually in the
 * React layer: `GameCard`'s `arePropsEqual` memo comparator was missing
 * `defeatProcessed` from its field list. After undo, `state.activeCards[i]`
 * swapped from `card_dead` (`{ ...alive, defeatProcessed: true }`) back to
 * the original `alive` ref. Because every other listed field matched, the
 * memo returned `true`, React skipped the re-render, and the
 * `data-defeat="true"` attribute (driven by `card.defeatProcessed`) stayed
 * in the DOM. The CSS `forwards` fill on the `dh-card-death` keyframe then
 * locked the card grey for the rest of its life on the row.
 */
describe('GameCard memo: defeatProcessed must invalidate', () => {
  it('arePropsEqual returns false when only defeatProcessed flips true → undefined', () => {
    const aliveCard: GameCardData = {
      id: 'mon-A', type: 'monster', name: '小虫子', monsterType: 'Buglet',
      value: 2, attack: 2, hp: 1, maxHp: 1, baseAttack: 2, baseHp: 1,
      fury: 1, hpLayers: 1, currentLayer: 1, isBuglet: true,
    } as GameCardData;
    const deadCard: GameCardData = { ...aliveCard, defeatProcessed: true };

    const baseProps: GameCardProps = {
      card: deadCard,
      defeatAnimation: false,
      isEngaged: false,
      className: '',
    };
    const nextProps: GameCardProps = { ...baseProps, card: aliveCard };

    expect(arePropsEqual(baseProps, nextProps)).toBe(false);
  });

  it('arePropsEqual returns false when defeatProcessed flips undefined → true (kill direction)', () => {
    const aliveCard: GameCardData = {
      id: 'mon-A', type: 'monster', name: '小虫子', monsterType: 'Buglet',
      value: 2, attack: 2, hp: 1, maxHp: 1, baseAttack: 2, baseHp: 1,
      fury: 1, hpLayers: 1, currentLayer: 1, isBuglet: true,
    } as GameCardData;
    const deadCard: GameCardData = { ...aliveCard, defeatProcessed: true };

    const prev: GameCardProps = { card: aliveCard, defeatAnimation: false, isEngaged: false, className: '' };
    const next: GameCardProps = { ...prev, card: deadCard };

    expect(arePropsEqual(prev, next)).toBe(false);
  });
});
