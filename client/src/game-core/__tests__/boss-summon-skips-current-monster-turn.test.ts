/**
 * Regression: Boss「亡灵召唤」(`bossEnrageGraveyardSummon`) 当场召唤的怪物
 * 必须**跳过紧接着的那一次 monster 回合**。
 *
 * 用户报告的 bug：「拖动 Boss 先攻击，激怒触发亡灵召唤，招出来的 monster
 * 不应该参与此次 monster 攻击。」
 *
 * 触发链：
 *   1. 玩家拖武器 → `INITIATE_WEAPON_ATTACK`
 *   2. enqueue: `BEGIN_COMBAT` (boss 进入战斗 → 亡灵召唤 → 召唤怪物)
 *      `combat:autoEngage` 把召唤的怪物也变成 engaged
 *   3. enqueue: `PERFORM_HERO_ATTACK` (英雄攻击 boss)
 *   4. 玩家结束回合 → `END_TURN` → `endHeroTurnPatch` 构造 monster 攻击队列
 *
 * 旧实现：`monsterAttackQueue = engagedMonsterIds`，包括刚召唤的怪物 → 它们
 * 立刻参战，玩家没有反应窗口。
 *
 * 修复：召唤时给怪物打 `skipNextMonsterTurn: true`；`endHeroTurnPatch` 把这
 * 些卡从 attack queue 排除掉、剥离 flag、写一条 log。下一回合开始它们正常
 * 参战。
 */
import { describe, expect, it } from 'vitest';
import { GameEngine, reduce } from '../index';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { resetMonsterForGraveyard } from '../cards';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeBoss(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'boss-1',
    type: 'monster',
    name: '终末巫王',
    value: 0,
    image: '',
    hp: 50,
    maxHp: 50,
    attack: 1,
    fury: 1,
    hpLayers: 1,
    currentLayer: 1,
    bossPhase: true,
    bossEnrageGraveyardSummon: 4,
    hasRevive: true,
    reviveUsed: false,
    ...(over ?? {}),
  } as GameCardData;
}

function makeMonster(id: string, name: string, over?: Partial<GameCardData>): GameCardData {
  return {
    id, type: 'monster', name, value: 3, image: '',
    hp: 5, maxHp: 5, attack: 3, fury: 1, hpLayers: 1, currentLayer: 1,
    ...(over ?? {}),
  } as GameCardData;
}

function makeNonMonster(id: string, name: string): GameCardData {
  return { id, type: 'potion', name, value: 0, image: '' } as GameCardData;
}

describe('boss summon — summoned monsters skip the very next monster turn', () => {
  it('reducer-level: BEGIN_COMBAT marks summoned monsters with skipNextMonsterTurn: true', () => {
    const boss = makeBoss();
    const ghostA = makeMonster('g-m1', 'GhostA');
    const ghostB = makeMonster('g-m2', 'GhostB');
    const state = makeState({
      activeCards: [boss, null, null, null] as any,
      discardedCards: [
        ghostA,
        ghostB,
        makeNonMonster('g-p1', 'Potion1'),
        makeNonMonster('g-p2', 'Potion2'),
      ],
      combatState: { ...initialCombatState, engagedMonsterIds: [] },
    });

    const r = reduce(state, { type: 'BEGIN_COMBAT', monster: boss, initiator: 'hero' } as any);

    // Both summoned monsters should be on the active row, each marked.
    const summonedA = r.state.activeCards.find(c => c?.id === ghostA.id);
    const summonedB = r.state.activeCards.find(c => c?.id === ghostB.id);
    expect(summonedA).toBeDefined();
    expect(summonedB).toBeDefined();
    expect(summonedA!.skipNextMonsterTurn).toBe(true);
    expect(summonedB!.skipNextMonsterTurn).toBe(true);

    // Boss itself is NOT marked — it should attack normally.
    const bossInRow = r.state.activeCards.find(c => c?.id === boss.id);
    expect(bossInRow!.skipNextMonsterTurn).toBeUndefined();
  });

  it('reducer-level: END_TURN excludes flagged monsters from monsterAttackQueue + strips the flag', () => {
    // Fixture: boss + 2 just-summoned monsters all engaged. Drain END_TURN.
    const boss = makeBoss();
    const summonedA = makeMonster('g-m1', 'GhostA', { skipNextMonsterTurn: true });
    const summonedB = makeMonster('g-m2', 'GhostB', { skipNextMonsterTurn: true });
    const state = makeState({
      activeCards: [boss, summonedA, summonedB, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [boss.id, summonedA.id, summonedB.id],
        currentTurn: 'hero',
      },
    });

    const after = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] }]);

    // Attack queue: only boss (or empty after first ADVANCE_MONSTER_TURN consumed
    // boss). The key is that summonedA / summonedB **never** get queued.
    // ADVANCE_MONSTER_TURN runs synchronously after END_TURN (both whitelisted
    // in pipeline), so by this point the queue may have already shifted boss
    // out into pendingBlock.
    const queueAfter = after.state.combatState.monsterAttackQueue;
    const pending = after.state.combatState.pendingBlock;
    const allWhoWillAttack = [...queueAfter, ...(pending ? [pending.monsterId] : [])];
    expect(allWhoWillAttack).not.toContain(summonedA.id);
    expect(allWhoWillAttack).not.toContain(summonedB.id);
    expect(allWhoWillAttack).toContain(boss.id);

    // Flag stripped on activeCards so next END_TURN they participate normally.
    const liveA = after.state.activeCards.find(c => c?.id === summonedA.id);
    const liveB = after.state.activeCards.find(c => c?.id === summonedB.id);
    expect(liveA!.skipNextMonsterTurn).toBeUndefined();
    expect(liveB!.skipNextMonsterTurn).toBeUndefined();

    // They are still engaged (player can still target them).
    expect(after.state.combatState.engagedMonsterIds).toContain(summonedA.id);
    expect(after.state.combatState.engagedMonsterIds).toContain(summonedB.id);
  });

  it('next END_TURN cycle: previously-summoned monsters DO attack', () => {
    // Fixture: simulate "one full turn after the summon". Flag is gone, both
    // monsters are still engaged, boss is dead so only summoned ones are
    // alive. END_TURN should put them in the attack queue normally.
    const summonedA = makeMonster('g-m1', 'GhostA'); // no flag
    const summonedB = makeMonster('g-m2', 'GhostB'); // no flag
    const state = makeState({
      activeCards: [null, summonedA, summonedB, null] as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [summonedA.id, summonedB.id],
        currentTurn: 'hero',
      },
    });

    const after = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] }]);

    // Either still in queue or shifted into pendingBlock — but at least
    // ONE of them must be slated to attack.
    const queueAfter = after.state.combatState.monsterAttackQueue;
    const pending = after.state.combatState.pendingBlock;
    const allWhoWillAttack = [...queueAfter, ...(pending ? [pending.monsterId] : [])];
    expect(allWhoWillAttack.length).toBeGreaterThan(0);
    expect(
      allWhoWillAttack.includes(summonedA.id) || allWhoWillAttack.includes(summonedB.id),
    ).toBe(true);
  });

  it('end-to-end via GameEngine: drag-attack boss → boss summons → end turn → only boss attacks', () => {
    // Full pipeline simulation: dispatch INITIATE_WEAPON_ATTACK on the boss.
    // BEGIN_COMBAT triggers the summon; combat:autoEngage listener engages
    // the summoned monsters. PERFORM_HERO_ATTACK hits the boss. Then END_TURN.
    const boss = makeBoss({ hp: 50, maxHp: 50 });
    const weapon: GameCardData = {
      id: 'w-sword',
      type: 'weapon',
      name: 'Sword',
      value: 5,
      attack: 5,
      durability: 3,
      maxDurability: 3,
    } as GameCardData;
    const ghostA = makeMonster('g-m1', 'GhostA');
    const ghostB = makeMonster('g-m2', 'GhostB');
    const initial = makeState({
      activeCards: [boss, null, null, null] as any,
      equipmentSlot1: weapon as any,
      discardedCards: [
        ghostA,
        ghostB,
        makeNonMonster('g-p1', 'Potion1'),
        makeNonMonster('g-p2', 'Potion2'),
      ],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: [],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      },
    });

    const engine = new GameEngine(initial);

    // Simulate `useCombatActions`'s combat:autoEngage listener.
    engine.on('combat:autoEngage', ({ monsterId }) => {
      const st = engine.getState();
      const monster = st.activeCards.find(c => c?.id === monsterId);
      if (monster && !st.combatState.engagedMonsterIds.includes(monsterId)) {
        engine.dispatch({
          type: 'BEGIN_COMBAT',
          monster: monster as GameCardData,
          initiator: 'hero',
        });
      }
    });
    engine.on('ui:monsterSkillFloat', ({ floatId }) => {
      engine.dispatch({ type: 'RELEASE_MONSTER_SKILL_FLOAT', floatId });
    });

    // 1) Player drags weapon onto boss.
    engine.dispatch({
      type: 'INITIATE_WEAPON_ATTACK',
      slotId: 'equipmentSlot1',
      monsterId: boss.id,
    });

    // After step 1: boss attacked once, both summoned monsters engaged & flagged.
    const afterAttack = engine.getState();
    expect(afterAttack.combatState.engagedMonsterIds).toContain(boss.id);
    expect(afterAttack.combatState.engagedMonsterIds).toContain(ghostA.id);
    expect(afterAttack.combatState.engagedMonsterIds).toContain(ghostB.id);
    const aBeforeTurn = afterAttack.activeCards.find(c => c?.id === ghostA.id);
    const bBeforeTurn = afterAttack.activeCards.find(c => c?.id === ghostB.id);
    expect(aBeforeTurn?.skipNextMonsterTurn).toBe(true);
    expect(bBeforeTurn?.skipNextMonsterTurn).toBe(true);

    // 2) Player ends hero turn.
    engine.dispatch({ type: 'END_TURN', heroTurnLayerLossIds: [] });

    const afterEnd = engine.getState();

    // Summoned monsters must NOT be in the attack queue or pendingBlock.
    const queue = afterEnd.combatState.monsterAttackQueue;
    const pendingId = afterEnd.combatState.pendingBlock?.monsterId;
    const willAttack = [...queue, ...(pendingId ? [pendingId] : [])];
    expect(willAttack).not.toContain(ghostA.id);
    expect(willAttack).not.toContain(ghostB.id);

    // Boss SHOULD be queued / pending (it's still alive, no flag).
    expect(willAttack).toContain(boss.id);

    // Flag stripped — they fight normally on the turn after this.
    const aAfter = afterEnd.activeCards.find(c => c?.id === ghostA.id);
    const bAfter = afterEnd.activeCards.find(c => c?.id === ghostB.id);
    expect(aAfter?.skipNextMonsterTurn).toBeUndefined();
    expect(bAfter?.skipNextMonsterTurn).toBeUndefined();
  });
});

describe('boss summon — flag is transient combat state, never persists into graveyard', () => {
  it('resetMonsterForGraveyard strips skipNextMonsterTurn so it cannot leak into future graveyard-recovery paths', () => {
    // 不变量：被 Boss 召唤过、带 `skipNextMonsterTurn` 的怪物如果死亡，进坟场之前
    // 必须把这个 flag 剥掉。否则下一次被召唤 / 复生 / persuade 拉回场上时还残留
    // skip 状态 —— 它本应该正常参战，却被算法误判成「刚被召唤」继续跳过。
    const summoned = makeMonster('g-m1', 'GhostA', {
      skipNextMonsterTurn: true,
      tempAttackBoost: 5,
      reviveUsed: true,
    });

    const cleaned = resetMonsterForGraveyard(summoned);

    expect(cleaned.skipNextMonsterTurn).toBeUndefined();
    // Sanity: other transient combat fields also cleared (existing contract).
    expect(cleaned.tempAttackBoost).toBe(0);
    expect(cleaned.reviveUsed).toBe(false);
    expect(cleaned.currentLayer).toBe(1);
  });
});
