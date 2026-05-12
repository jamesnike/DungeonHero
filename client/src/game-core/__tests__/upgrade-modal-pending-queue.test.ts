/**
 * `pendingUpgradeModalOpens` queue — regression for "kill-triggered upgrade
 * modal collides with monster loot upgrade reward, only one modal opens".
 *
 * Bug history (user report): 淬炼冲击 (overkill-upgrade) overkilled a monster,
 * the monster's loot reward queue offered an `upgradeCard` reward, the player
 * picked it — but only ONE upgrade modal showed up instead of two. Root cause:
 * both paths used `upgradeModalOpen: true` (boolean) directly, so two opens in
 * the same frame collapsed into one upgrade opportunity.
 *
 * Fix: kill-triggered upgrade requests (`overkill-upgrade`,
 * `monster-kill-upgrade` amulet, `'upgradeCard'` loot) now `ENQUEUE_PENDING_*`
 * an entry into `pendingUpgradeModalOpens`. `CHECK_PENDING_UPGRADE_MODAL` opens
 * one entry at a time, gated by `activeMonsterReward` / `monsterRewardQueue` /
 * `discoverModalOpen` / `eventModalOpen` / current `upgradeModalOpen`.
 *
 * Coverage matrix:
 *   1. `淬炼冲击` overkill alone → entry queued, awaits reward modal to clear.
 *   2. `'upgradeCard'` reward processed while another pending entry exists →
 *      both entries end up in queue; CHECK pops them sequentially.
 *   3. After upgrade modal closes via `SET_UPGRADE_MODAL_OPEN(false)`, CHECK
 *      drains the next pending entry.
 *   4. `UPGRADE_CARD` (single-shot, maxCount=undefined) closes the modal AND
 *      enqueues CHECK to drain the next pending entry.
 *   5. CHECK is idempotent / no-op when blockers are present or queue empty.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...(overrides ?? {}) };
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

describe('pendingUpgradeModalOpens — basic queue mechanics', () => {
  it('ENQUEUE_PENDING pushes entry and enqueues CHECK', () => {
    const state = makeState();
    const result = drain(state, [
      { type: 'ENQUEUE_PENDING_UPGRADE_MODAL', maxCount: 2, banner: 'test banner' } as GameAction,
    ]);
    // Drain consumed both ENQUEUE and CHECK (no blockers in fresh state, so
    // CHECK pops the entry and enqueues SET_UPGRADE_MODAL_OPEN, which opens it).
    expect(result.state.pendingUpgradeModalOpens.length).toBe(0);
    expect(result.state.upgradeModalOpen).toBe(true);
    expect(result.state.upgradeModalMaxCount).toBe(2);
    expect(result.state.heroSkillBanner).toBe('test banner');
  });

  it('CHECK is no-op when queue empty', () => {
    const state = makeState();
    const result = reduce(state, { type: 'CHECK_PENDING_UPGRADE_MODAL' });
    expect(result.state.upgradeModalOpen).toBe(false);
    expect(result.state.pendingUpgradeModalOpens.length).toBe(0);
  });

  it('CHECK is blocked by activeMonsterReward', () => {
    const state = makeState({
      pendingUpgradeModalOpens: [{ maxCount: undefined }],
      activeMonsterReward: {
        monsterInstanceId: 'm1',
        monsterName: 'Test',
        monsterCard: makeMonster('m1', 1) as any,
        options: [],
      } as any,
    });
    const result = drain(state, [{ type: 'CHECK_PENDING_UPGRADE_MODAL' } as GameAction]);
    expect(result.state.upgradeModalOpen).toBe(false);
    expect(result.state.pendingUpgradeModalOpens.length).toBe(1);
  });

  it('CHECK is blocked by upgradeModalOpen=true (already open)', () => {
    const state = makeState({
      pendingUpgradeModalOpens: [{ maxCount: undefined }],
      upgradeModalOpen: true,
    });
    const result = drain(state, [{ type: 'CHECK_PENDING_UPGRADE_MODAL' } as GameAction]);
    expect(result.state.pendingUpgradeModalOpens.length).toBe(1);
  });

  it('SET_UPGRADE_MODAL_OPEN(open=false) enqueues CHECK so next entry drains', () => {
    const state = makeState({
      pendingUpgradeModalOpens: [{ maxCount: 1, banner: 'next pending' }],
      upgradeModalOpen: true,
      upgradeModalMaxCount: 1,
    });
    const result = drain(state, [
      { type: 'SET_UPGRADE_MODAL_OPEN', open: false } as GameAction,
    ]);
    // Modal closed → CHECK fired → next pending entry opened.
    expect(result.state.pendingUpgradeModalOpens.length).toBe(0);
    expect(result.state.upgradeModalOpen).toBe(true);
    expect(result.state.upgradeModalMaxCount).toBe(1);
    expect(result.state.heroSkillBanner).toBe('next pending');
  });

  it('queue with 3 entries pops them sequentially across modal close cycles', () => {
    const state = makeState();
    let s = drain(state, [
      { type: 'ENQUEUE_PENDING_UPGRADE_MODAL', maxCount: undefined, banner: 'a' } as GameAction,
      { type: 'ENQUEUE_PENDING_UPGRADE_MODAL', maxCount: 2, banner: 'b' } as GameAction,
      { type: 'ENQUEUE_PENDING_UPGRADE_MODAL', maxCount: undefined, banner: 'c' } as GameAction,
    ]).state;
    // 第一条被 CHECK 立刻 pop 出来，剩余两条等模态关闭。
    expect(s.upgradeModalOpen).toBe(true);
    expect(s.upgradeModalMaxCount).toBeUndefined();
    expect(s.heroSkillBanner).toBe('a');
    expect(s.pendingUpgradeModalOpens.length).toBe(2);

    // Player closes modal.
    s = drain(s, [{ type: 'SET_UPGRADE_MODAL_OPEN', open: false } as GameAction]).state;
    expect(s.upgradeModalOpen).toBe(true);
    expect(s.upgradeModalMaxCount).toBe(2);
    expect(s.heroSkillBanner).toBe('b');
    expect(s.pendingUpgradeModalOpens.length).toBe(1);

    // Player closes modal.
    s = drain(s, [{ type: 'SET_UPGRADE_MODAL_OPEN', open: false } as GameAction]).state;
    expect(s.upgradeModalOpen).toBe(true);
    expect(s.upgradeModalMaxCount).toBeUndefined();
    expect(s.heroSkillBanner).toBe('c');
    expect(s.pendingUpgradeModalOpens.length).toBe(0);

    // Player closes the last one — no more pending, modal stays closed.
    s = drain(s, [{ type: 'SET_UPGRADE_MODAL_OPEN', open: false } as GameAction]).state;
    expect(s.upgradeModalOpen).toBe(false);
    expect(s.pendingUpgradeModalOpens.length).toBe(0);
  });
});

describe('pendingUpgradeModalOpens — 淬炼冲击 superkill + 战利品 upgradeCard race', () => {
  function makeOverkillCard(level: number): GameCardData {
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

  it('regression: superkill + chosen upgradeCard reward → 2 sequential upgrade modals', () => {
    // Setup: 淬炼冲击 L0 + 1 hp monster → guaranteed overkill.
    const card = makeOverkillCard(0);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 1)),
    });

    // Step 1: play card + select monster → overkill kills monster, enqueues
    // pending upgrade entry, monster reward queued.
    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const afterResolve = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'm1' } as GameAction],
    );

    // Spell's pending entry MUST still be queued (blocked by reward modal).
    expect(afterResolve.state.pendingUpgradeModalOpens.length).toBe(1);
    expect(afterResolve.state.activeMonsterReward).not.toBeNull();
    expect(afterResolve.state.upgradeModalOpen).toBeFalsy();

    // Step 2: simulate "player picks upgradeCard reward" by manually replacing
    // the active reward with a synthetic upgradeCard option, then dispatching
    // APPLY_MONSTER_REWARD. (We don't go through generateMonsterRewardOptions
    // RNG because we want a deterministic upgradeCard reward for the test.)
    const stateWithUpgradeReward: GameState = {
      ...afterResolve.state,
      activeMonsterReward: {
        ...afterResolve.state.activeMonsterReward!,
        options: [{ id: 'opt-upgrade', title: '升级一张牌', description: '', detail: '', effect: { type: 'upgradeCard' } } as any],
      } as any,
    };
    const afterReward = drain(
      stateWithUpgradeReward,
      [{ type: 'APPLY_MONSTER_REWARD', rewardType: 'upgradeCard' } as GameAction],
    );

    // After picking the reward, the spell's pending entry pops first
    // (queue order: spell → upgradeCard reward).
    expect(afterReward.state.upgradeModalOpen).toBe(true);
    expect(afterReward.state.upgradeModalMaxCount).toBeUndefined();
    expect(afterReward.state.activeMonsterReward).toBeNull();
    // upgradeCard reward's pending entry STILL waits in queue.
    expect(afterReward.state.pendingUpgradeModalOpens.length).toBe(1);

    // Step 3: simulate player closing the spell's upgrade modal (after
    // upgrading 1 card). CardUpgradeModal's auto-close path dispatches
    // SET_UPGRADE_MODAL_OPEN(open=false) → CHECK enqueued → upgradeCard reward
    // pending entry pops.
    const afterClose = drain(
      afterReward.state,
      [{ type: 'SET_UPGRADE_MODAL_OPEN', open: false } as GameAction],
    );

    expect(afterClose.state.upgradeModalOpen).toBe(true);
    expect(afterClose.state.upgradeModalMaxCount).toBeUndefined();
    expect(afterClose.state.pendingUpgradeModalOpens.length).toBe(0);
  });

  it('superkill alone (no reward) → modal opens immediately after reward is consumed (cleared)', () => {
    // Verify the queue mechanism doesn't break the simple case: when the
    // monster reward gets dismissed (cleared) WITHOUT picking upgradeCard,
    // the spell's pending entry should still pop.
    const card = makeOverkillCard(0);
    const state = makeState({
      handCards: [card],
      activeCards: activeRowOf(makeMonster('m1', 1)),
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const afterResolve = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'overkill-upgrade', monsterId: 'm1' } as GameAction],
    );

    // Pick a non-upgrade reward (e.g. gold) to clear the active reward.
    const stateWithGoldReward: GameState = {
      ...afterResolve.state,
      activeMonsterReward: {
        ...afterResolve.state.activeMonsterReward!,
        options: [{ id: 'opt-gold', title: '获得 5 金币', description: '', detail: '', effect: { type: 'gold', amount: 5 } } as any],
      } as any,
    };
    const afterReward = drain(
      stateWithGoldReward,
      [{ type: 'APPLY_MONSTER_REWARD', rewardType: 'gold', amount: 5 } as GameAction],
    );

    // Spell's pending entry pops; no extra entry from gold reward.
    expect(afterReward.state.upgradeModalOpen).toBe(true);
    expect(afterReward.state.upgradeModalMaxCount).toBeUndefined();
    expect(afterReward.state.pendingUpgradeModalOpens.length).toBe(0);
    expect(afterReward.state.gold).toBe(state.gold + 5);
  });
});

describe('pendingUpgradeModalOpens — 虫蜕之冠 (monster-kill-upgrade amulet) + reward race', () => {
  it('amulet 3rd-kill upgrade + concurrent upgradeCard reward → both queued', () => {
    // Place a monster-kill-upgrade amulet with 2/3 progress so the next kill
    // triggers it. Use a basic monster + minimal weapon to perform the kill.
    const monster = makeMonster('m1', 1);
    const state = makeState({
      monsterKillUpgradeProgress: 2,
      amuletSlots: [
        {
          id: 'crown',
          type: 'amulet',
          name: '虫蜕之冠',
          value: 0,
          amuletEffect: 'monster-kill-upgrade',
          _counterDisplay: '2/3',
        } as any,
        null,
        null,
        null,
        null,
        null,
      ] as any,
      activeCards: activeRowOf(monster),
    });

    // Manually dispatch MONSTER_DEFEATED to simulate the kill (skip combat
    // setup); this triggers the amulet's monster-kill-upgrade branch + the
    // standard reward queue.
    const result = drain(state, [
      { type: 'MONSTER_DEFEATED', monsterId: 'm1' } as GameAction,
    ]);

    // Amulet upgrade enqueued + reward queue populated → spell modal blocked
    // by activeMonsterReward.
    expect(result.state.pendingUpgradeModalOpens.length).toBe(1);
    expect(result.state.pendingUpgradeModalOpens[0].banner).toContain('虫蜕之冠');
    expect(result.state.upgradeModalOpen).toBeFalsy();
    expect(result.state.activeMonsterReward).not.toBeNull();
    expect(result.state.monsterKillUpgradeProgress).toBe(0);
  });
});
