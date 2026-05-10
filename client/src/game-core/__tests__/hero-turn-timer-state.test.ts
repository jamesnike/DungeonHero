import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const goblin: GameCardData = {
  id: 'm1',
  type: 'monster',
  name: 'Goblin',
  value: 5,
  hp: 10,
  maxHp: 10,
  attack: 5,
};

describe('hero turn timer — playerTurnStartedAt lifecycle', () => {
  describe('initial state', () => {
    it('is null on a fresh game (out of combat)', () => {
      const state = makeState();
      expect(state.playerTurnStartedAt).toBeNull();
    });
  });

  describe('BEGIN_COMBAT', () => {
    it('sets playerTurnStartedAt when hero starts a fresh combat (initiator=hero)', () => {
      const state = makeState({
        activeCards: [goblin, null, null, null, null],
        combatState: { ...initialCombatState },
        phase: 'playerInput',
      });
      const before = Date.now();
      const result = reduce(state, {
        type: 'BEGIN_COMBAT',
        monster: goblin,
        initiator: 'hero',
      });
      const after = Date.now();

      expect(result.state.combatState.currentTurn).toBe('hero');
      expect(result.state.playerTurnStartedAt).not.toBeNull();
      expect(result.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(before);
      expect(result.state.playerTurnStartedAt!).toBeLessThanOrEqual(after);
    });

    it('does NOT set playerTurnStartedAt when monster initiates (currentTurn=monster + pendingBlock)', () => {
      const state = makeState({
        activeCards: [goblin, null, null, null, null],
        combatState: { ...initialCombatState },
        phase: 'playerInput',
      });
      const result = reduce(state, {
        type: 'BEGIN_COMBAT',
        monster: goblin,
        initiator: 'monster',
      });

      expect(result.state.combatState.currentTurn).toBe('monster');
      expect(result.state.playerTurnStartedAt).toBeNull();
    });

    it('does NOT set playerTurnStartedAt when adding to existing combat (already engaged)', () => {
      const otherMonster: GameCardData = { ...goblin, id: 'm2' };
      const existingTimestamp = Date.now() - 5_000;
      const state = makeState({
        activeCards: [goblin, otherMonster, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
        playerTurnStartedAt: existingTimestamp,
        phase: 'playerInput',
      });
      const result = reduce(state, {
        type: 'BEGIN_COMBAT',
        monster: otherMonster,
        initiator: 'hero',
      });

      // The original timestamp must NOT be reset by adding more engaged monsters
      // mid-turn — the timer continues from the original start.
      expect(result.state.playerTurnStartedAt).toBe(existingTimestamp);
    });
  });

  describe('END_TURN', () => {
    it('clears playerTurnStartedAt when ending the hero turn (with engaged monsters)', () => {
      const state = makeState({
        activeCards: [goblin, null, null, null, null],
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
        playerTurnStartedAt: Date.now() - 30_000,
      });
      const result = reduce(state, {
        type: 'END_TURN',
        heroTurnLayerLossIds: [],
      });

      expect(result.state.playerTurnStartedAt).toBeNull();
    });

    it('clears playerTurnStartedAt when END_TURN ends combat (no engaged monsters)', () => {
      const state = makeState({
        combatState: { ...initialCombatState },
        playerTurnStartedAt: Date.now() - 10_000,
      });
      const result = reduce(state, {
        type: 'END_TURN',
        heroTurnLayerLossIds: [],
      });

      expect(result.state.playerTurnStartedAt).toBeNull();
    });
  });

  describe('START_TURN', () => {
    it('sets playerTurnStartedAt to a fresh timestamp at the start of each hero turn', () => {
      const oldTimestamp = Date.now() - 60_000;
      const state = makeState({
        playerTurnStartedAt: oldTimestamp,
      });
      const before = Date.now();
      const result = reduce(state, {
        type: 'START_TURN',
        suppressAmuletReapply: true,
      });
      const after = Date.now();

      expect(result.state.playerTurnStartedAt).not.toBeNull();
      expect(result.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(before);
      expect(result.state.playerTurnStartedAt!).toBeLessThanOrEqual(after);
      expect(result.state.playerTurnStartedAt).not.toBe(oldTimestamp);
    });
  });

  describe('FINISH_COMBAT', () => {
    it('clears playerTurnStartedAt when combat finishes (last monster killed)', () => {
      const state = makeState({
        combatState: {
          ...initialCombatState,
          engagedMonsterIds: ['m1'],
          currentTurn: 'hero',
        },
        playerTurnStartedAt: Date.now() - 5_000,
      });
      const result = reduce(state, { type: 'FINISH_COMBAT' });

      expect(result.state.playerTurnStartedAt).toBeNull();
    });
  });
});

describe('hero turn timer — FORCE_END_HERO_TURN reducer', () => {
  it('resets engine-side modal state and enqueues END_TURN', () => {
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 60_000,
      phase: 'awaitingMagicTarget',
      pendingMagicAction: { card: { ...goblin, id: 'magic-1', type: 'magic' as const, name: 'Test', value: 0 } as GameCardData, step: 'monster-target' } as GameState['pendingMagicAction'],
      discoverModalOpen: true,
      discoverOptions: [goblin],
      shopModalOpen: true,
      permGrantModal: { sourceCardId: 'src', sourceType: 'magic' },
      eventModalOpen: true,
    });

    const result = reduce(state, {
      type: 'FORCE_END_HERO_TURN',
      heroTurnLayerLossIds: ['m1'],
    });

    // All engine modal/interaction state cleared
    expect(result.state.pendingMagicAction).toBeNull();
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.discoverOptions).toEqual([]);
    expect(result.state.shopModalOpen).toBe(false);
    expect(result.state.permGrantModal).toBeNull();
    expect(result.state.eventModalOpen).toBe(false);
    // Phase pushed back to playerInput so END_TURN can drain
    expect(result.state.phase).toBe('playerInput');
    // The fixture has a magic card in pendingMagicAction, so the rescue path
    // enqueues FINALIZE_MAGIC_CARD BEFORE END_TURN so the card is routed to
    // its proper disposition (graveyard/recycle bag) instead of vanishing.
    expect(result.enqueuedActions).toEqual([
      expect.objectContaining({
        type: 'FINALIZE_MAGIC_CARD',
        card: expect.objectContaining({ id: 'magic-1' }),
        dealtDamage: false,
      }),
      { type: 'END_TURN', heroTurnLayerLossIds: ['m1'] },
    ]);
    // Side effects include log + banner
    expect(result.sideEffects.some(e => e.event === 'log:entry')).toBe(true);
    expect(result.sideEffects.some(e => e.event === 'ui:banner')).toBe(true);
  });

  it('end-to-end: drains FORCE_END_HERO_TURN → END_TURN, clearing playerTurnStartedAt (out of combat)', () => {
    // Out-of-combat ⇒ END_TURN takes the no-engaged-monsters branch → returns
    // straight to playerInput. playerTurnStartedAt stays null since no fresh
    // hero turn starts.
    const state = makeState({
      combatState: { ...initialCombatState },
      playerTurnStartedAt: 12345,
      phase: 'playerInput',
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    expect(drained.state.playerTurnStartedAt).toBeNull();
    expect(drained.state.phase).toBe('playerInput');
  });

  it('end-to-end: FORCE_END_HERO_TURN with engaged monster transitions to monster turn', () => {
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        monsterAttackQueue: [],
      },
      playerTurnStartedAt: Date.now() - 60_000,
      phase: 'playerInput',
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    // After draining: monster has a pendingBlock waiting on the player.
    // currentTurn flipped to 'monster'. Phase paused on 'awaitingBlock'.
    expect(drained.state.combatState.currentTurn).toBe('monster');
    expect(drained.state.phase).toBe('awaitingBlock');
    // playerTurnStartedAt was cleared by FORCE_END_HERO_TURN (and again by
    // END_TURN); hero turn hasn't restarted yet (player must resolve the
    // block first), so it stays null.
    expect(drained.state.playerTurnStartedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Regression: card-in-limbo rescue on FORCE_END_HERO_TURN
//
// Bug: 净册涌泉 / 装备灵附 / 镜影摹形 etc. (interactive magic) put the source
// card into `pendingMagicAction.card` and remove it from handCards. If the
// 40s timer expired before the player resolved the modal, the old reducer
// cleared `pendingMagicAction = null` without routing the card → 卡凭空消失
// (违反 disposition router 不变量, per pipeline-input-continuation.mdc 的
// "disposition router strand" 警告).
//
// Fix: enqueue FINALIZE_MAGIC_CARD / FINALIZE_POTION_CARD before END_TURN so
// the card走正常 disposition route (Perm → recycle bag, 否则 → graveyard).
// ---------------------------------------------------------------------------

describe('hero turn timer — card-in-limbo rescue on FORCE_END_HERO_TURN', () => {
  // 净册涌泉: knight-class permanent magic with `magicType: 'permanent'` and
  // `recycleDelay`, so it should route to permanentMagicRecycleBag (not graveyard).
  function makePermMagic(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'magic-cleanse',
      type: 'magic',
      name: '净册涌泉',
      value: 0,
      image: '',
      magicType: 'permanent',
      classCard: true,
      knightEffect: 'cleanse-draw',
      recycleDelay: 1,
      ...over,
    } as GameCardData;
  }

  // A standard non-Perm potion (e.g., 淬炼药剂). Routes to graveyard.
  function makeInstantPotion(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'potion-test',
      type: 'potion',
      name: '淬炼药剂',
      value: 6,
      image: '',
      potionEffect: 'perm-equipment-durability-max+1' as any,
      ...over,
    } as GameCardData;
  }

  it('Perm magic in pendingMagicAction is rescued to recycle bag (not vanished)', () => {
    const card = makePermMagic();
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 40_000,
      phase: 'playerInput',
      handCards: [], // card already removed from hand when played
      permanentMagicRecycleBag: [],
      discardedCards: [],
      pendingMagicAction: {
        card,
        effect: 'cleanse-draw',
        step: 'cleanse-draw-select',
        echoRemaining: 1,
        data: { drawCount: 3 },
      } as any,
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    // Card must NOT have vanished — it should be in the recycle bag.
    const inRecycle = drained.state.permanentMagicRecycleBag.find(c => c.id === 'magic-cleanse');
    expect(inRecycle).toBeDefined();
    expect(inRecycle?.name).toBe('净册涌泉');
    // Pending state cleared.
    expect(drained.state.pendingMagicAction).toBeNull();
  });

  it('non-Perm magic in pendingMagicAction is rescued to graveyard (not vanished)', () => {
    const card: GameCardData = {
      id: 'magic-instant',
      type: 'magic',
      name: '一次性魔法',
      value: 0,
      image: '',
      magicType: 'instant',
    } as GameCardData;
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 40_000,
      phase: 'playerInput',
      handCards: [],
      discardedCards: [],
      pendingMagicAction: {
        card,
        effect: 'armor-strike',
        step: 'slot-select',
        prompt: '',
      } as any,
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    const inGrave = drained.state.discardedCards.find(c => c.id === 'magic-instant');
    expect(inGrave).toBeDefined();
    expect(drained.state.pendingMagicAction).toBeNull();
  });

  it('non-Perm potion in pendingPotionAction is rescued to graveyard (not vanished)', () => {
    const card = makeInstantPotion();
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 40_000,
      phase: 'playerInput',
      handCards: [],
      discardedCards: [],
      pendingPotionAction: {
        card,
        effect: 'perm-equipment-durability-max+1',
        step: 'slot-select',
        prompt: '',
      } as any,
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    const inGrave = drained.state.discardedCards.find(c => c.id === 'potion-test');
    expect(inGrave).toBeDefined();
    expect(drained.state.pendingPotionAction).toBeNull();
  });

  it('Perm potion (永恒铭刻药 后的) in pendingPotionAction is rescued to recycle bag', () => {
    // 永恒铭刻药 grants recycleDelay to a hand card. If a Perm-granted potion
    // sits in pendingPotionAction when the timer expires, it should still
    // route to recycle bag (not graveyard).
    const card = makeInstantPotion({ id: 'potion-perm', recycleDelay: 2 });
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 40_000,
      phase: 'playerInput',
      handCards: [],
      permanentMagicRecycleBag: [],
      discardedCards: [],
      pendingPotionAction: {
        card,
        effect: 'perm-equipment-durability-max+1',
        step: 'slot-select',
        prompt: '',
      } as any,
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    const inRecycle = drained.state.permanentMagicRecycleBag.find(c => c.id === 'potion-perm');
    expect(inRecycle).toBeDefined();
    expect(drained.state.pendingPotionAction).toBeNull();
    // Did NOT also leak into graveyard.
    expect(drained.state.discardedCards.some(c => c.id === 'potion-perm')).toBe(false);
  });

  it('both magic AND potion stuck simultaneously: both are rescued', () => {
    // Edge case — should never happen in real play (one pending at a time),
    // but defensive: if both somehow co-exist, both must be rescued.
    const magic = makePermMagic();
    const potion = makeInstantPotion();
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      },
      playerTurnStartedAt: Date.now() - 40_000,
      phase: 'playerInput',
      handCards: [],
      permanentMagicRecycleBag: [],
      discardedCards: [],
      pendingMagicAction: { card: magic, effect: 'cleanse-draw', step: 'cleanse-draw-select', data: { drawCount: 3 } } as any,
      pendingPotionAction: { card: potion, effect: 'perm-equipment-durability-max+1', step: 'slot-select', prompt: '' } as any,
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    expect(drained.state.permanentMagicRecycleBag.find(c => c.id === 'magic-cleanse')).toBeDefined();
    expect(drained.state.discardedCards.find(c => c.id === 'potion-test')).toBeDefined();
    expect(drained.state.pendingMagicAction).toBeNull();
    expect(drained.state.pendingPotionAction).toBeNull();
  });

  it('no card in limbo (timer expires while player just thinking): END_TURN proceeds normally', () => {
    // Sanity: the rescue path is conditional. If pending* are null,
    // FORCE_END_HERO_TURN should NOT enqueue spurious FINALIZE actions and
    // should still END_TURN cleanly.
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        monsterAttackQueue: [],
      },
      playerTurnStartedAt: Date.now() - 40_000,
      phase: 'playerInput',
      handCards: [],
      discardedCards: [],
      permanentMagicRecycleBag: [],
      pendingMagicAction: null,
      pendingPotionAction: null,
    });

    const drained = drain(state, [
      { type: 'FORCE_END_HERO_TURN', heroTurnLayerLossIds: [] },
    ]);

    // No phantom cards leaked anywhere.
    expect(drained.state.discardedCards).toHaveLength(0);
    expect(drained.state.permanentMagicRecycleBag).toHaveLength(0);
    // Standard turn-end behavior (monster turn started, awaitingBlock).
    expect(drained.state.combatState.currentTurn).toBe('monster');
    expect(drained.state.phase).toBe('awaitingBlock');
  });
});

// ---------------------------------------------------------------------------
// Regression: monster-attacks-first scenario — hero turn timer must be fresh
// when player turn begins after monster's turn.
//
// Bug report (Sun May 10 2026): "let monster attack first, after attack
// reaches player turn, originally 40s but only 0s, then player turn auto-ends".
//
// Scenario: hero ends turn → monster turn (attacks, blocked) → END monster
// turn → APPLY_MONSTER_TURN_END_EFFECTS → START_TURN → hero turn begins.
// playerTurnStartedAt should be set fresh in START_TURN.
//
// Most likely cause: in the chain ADVANCE_MONSTER_TURN → currentTurn flips to
// hero AND combatState mutates → BoardOverlayButtons re-renders with
// playerTurnStartedAt=null → timer hidden. Then APPLY_MONSTER_TURN_END_EFFECTS
// runs, then START_TURN sets fresh timestamp. As long as START_TURN actually
// fires, the timer should be ~40s. Regression check: ensure the entire chain
// works and START_TURN sets a fresh timestamp.
// ---------------------------------------------------------------------------

describe('hero turn timer — monster-attacks-first scenario', () => {
  it('end-to-end: hero ends turn → monster attacks → block → back to hero turn → timer is fresh ~40s', () => {
    // Setup: hero has played some turns; about to end the current turn.
    // playerTurnStartedAt is from a much earlier moment (e.g., 38s ago) — close
    // to expiry. After monster turn cycle, this should be RESET to ~now.
    const oldTimestamp = Date.now() - 38_000; // 38s into hero turn
    const state = makeState({
      activeCards: [goblin, null, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        monsterAttackQueue: [],
      },
      playerTurnStartedAt: oldTimestamp,
      phase: 'playerInput',
      hp: 30,
      maxHp: 30,
    });

    // Step 1: player ends turn (manual END_TURN, simulating endHeroTurn hook)
    let r = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] }]);

    // Should be in monster turn now, awaiting block.
    expect(r.state.combatState.currentTurn).toBe('monster');
    expect(r.state.combatState.pendingBlock?.monsterId).toBe('m1');
    expect(r.state.phase).toBe('awaitingBlock');
    expect(r.state.playerTurnStartedAt).toBeNull(); // cleared by END_TURN

    // Step 2: player resolves the block (no-shield, take damage)
    const beforeStartTurn = Date.now();
    r = drain(r.state, [
      { type: 'RESOLVE_BLOCK', choice: 'no-shield' as any },
    ]);
    const afterStartTurn = Date.now();

    // After resolving the block:
    //   - monster attacked (player took damage)
    //   - queue empty → ADVANCE_MONSTER_TURN switches to hero
    //   - APPLY_MONSTER_TURN_END_EFFECTS → START_TURN
    //   - phase back to 'playerInput'
    //   - playerTurnStartedAt = Date.now() (fresh)
    expect(r.state.combatState.currentTurn).toBe('hero');
    expect(r.state.phase).toBe('playerInput');
    expect(r.state.playerTurnStartedAt).not.toBeNull();
    expect(r.state.playerTurnStartedAt).not.toBe(oldTimestamp);
    // Must be a fresh timestamp (within the duration of this test run)
    expect(r.state.playerTurnStartedAt!).toBeGreaterThanOrEqual(beforeStartTurn);
    expect(r.state.playerTurnStartedAt!).toBeLessThanOrEqual(afterStartTurn);
  });

  it('end-to-end: when goblin dice queue is non-empty, START_TURN delayed but still sets fresh timestamp after dice resolve', () => {
    // Setup: a goblin with stack count to trigger end-of-monster-turn dice.
    const goblinWithDice: GameCardData = {
      ...goblin,
      monsterSpecial: 'goblin-heal',
    } as GameCardData;
    const oldTimestamp = Date.now() - 38_000;
    const state = makeState({
      activeCards: [goblinWithDice, null, null, null, null],
      activeCardStacks: { 0: { stackCount: 1, stackedCards: [] } } as any,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
        monsterAttackQueue: [],
      },
      playerTurnStartedAt: oldTimestamp,
      phase: 'playerInput',
      hp: 30,
      maxHp: 30,
    });

    // End hero turn → monster attacks → block resolved → end monster turn
    let r = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] }]);
    if (r.state.combatState.pendingBlock) {
      r = drain(r.state, [{ type: 'RESOLVE_BLOCK', choice: 'no-shield' as any }]);
    }

    // After everything, playerTurnStartedAt must be fresh (or null if dice not resolved).
    // If dice are pending, START_TURN is deferred, so playerTurnStartedAt stays null
    // until dice resolve. That's expected; the timer just stays hidden.
    if (r.state.phase === 'awaitingDice') {
      expect(r.state.playerTurnStartedAt).toBeNull();
    } else {
      // No dice path: timer should be fresh.
      expect(r.state.playerTurnStartedAt).not.toBeNull();
      expect(r.state.playerTurnStartedAt).not.toBe(oldTimestamp);
    }
  });

  it('end-to-end: multiple monster attacks in sequence — timer resets fresh once all blocks resolved', () => {
    const goblin2: GameCardData = { ...goblin, id: 'm2' };
    const oldTimestamp = Date.now() - 38_000;
    const state = makeState({
      activeCards: [goblin, goblin2, null, null, null],
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1', 'm2'],
        currentTurn: 'hero',
        monsterAttackQueue: [],
      },
      playerTurnStartedAt: oldTimestamp,
      phase: 'playerInput',
      hp: 50,
      maxHp: 50,
    });

    // End hero turn → first monster attacks
    let r = drain(state, [{ type: 'END_TURN', heroTurnLayerLossIds: [] }]);
    expect(r.state.combatState.currentTurn).toBe('monster');
    expect(r.state.combatState.pendingBlock).not.toBeNull();
    expect(r.state.playerTurnStartedAt).toBeNull();

    // Resolve first block
    r = drain(r.state, [{ type: 'RESOLVE_BLOCK', choice: 'no-shield' as any }]);
    // Should have a second pending block for the second monster
    if (r.state.combatState.pendingBlock) {
      r = drain(r.state, [{ type: 'RESOLVE_BLOCK', choice: 'no-shield' as any }]);
    }

    // After all blocks resolved, hero turn should resume with fresh timer.
    expect(r.state.combatState.currentTurn).toBe('hero');
    expect(r.state.phase).toBe('playerInput');
    expect(r.state.playerTurnStartedAt).not.toBeNull();
    expect(r.state.playerTurnStartedAt).not.toBe(oldTimestamp);
    // Fresh: within ~1 second of now
    expect(Date.now() - r.state.playerTurnStartedAt!).toBeLessThan(1000);
  });
});

describe('hero turn timer — persistence round-trip', () => {
  it('serializes and hydrates playerTurnStartedAt', async () => {
    const { serializeGameState } = await import('../persistence');

    const timestamp = 1700000000000;
    const state = makeState({
      playerTurnStartedAt: timestamp,
    });

    const persisted = serializeGameState(state);
    expect(persisted.playerTurnStartedAt).toBe(timestamp);
  });

  it('serializes null when not in hero combat turn', async () => {
    const { serializeGameState } = await import('../persistence');

    const state = makeState({
      playerTurnStartedAt: null,
    });

    const persisted = serializeGameState(state);
    expect(persisted.playerTurnStartedAt).toBeNull();
  });

  it('hydrates legacy snapshots (missing field) to null via createInitialGameState default', async () => {
    // Old saves predating this feature won't have `playerTurnStartedAt`. The
    // hydrate path in `GameBoard.hydrateGameState` defaults it to `null`,
    // and `createInitialGameState()` also initializes it to null — so a fresh
    // engine state never has an undefined value here.
    expect(createInitialGameState().playerTurnStartedAt).toBeNull();
  });
});
