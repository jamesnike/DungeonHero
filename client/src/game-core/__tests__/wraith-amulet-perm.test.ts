/**
 * 被动销毁 amulet 时的 Perm 路由测试。
 *
 * 背景：附魔祭坛 给已装备 amulet 加 `recycleDelay: 2`。原实现下，被动销毁
 * amulet 的两条路径都没检查 Perm：
 *   - `turn.ts` 的 wraith-destroy-amulet：直接 filter，Perm amulet 消失
 *   - `events.ts` 的 `removeAllAmulets`（骰子事件「摧毁所有护符」）：全部进
 *     graveyard，Perm amulet 被丢进坟场而不是回收袋
 * 与装备的「Perm 损毁后进回收袋」契约不一致。
 *
 * 路由契约（与装备一致）：
 *   - 带 Perm（`cardHasPermFlag === true`）→ `ADD_TO_RECYCLE_BAG`
 *   - 非 Perm → 维持各路径的原行为（wraith 消失 / removeAllAmulets 进坟场）
 *   - `permStripped: true` 算非 Perm（凡化咒契约）
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { drainAutoReleasingFloats } from './_helpers';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

// Wraith monster — `wraithDestroyAmulet: true` is the trigger flag the
// turn-end pipeline reads. We park it in the active row and run
// APPLY_MONSTER_TURN_END_EFFECTS to fire the curse.
function makeWraith(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'wraith-1',
    type: 'monster',
    name: '诅咒怨灵',
    value: 0,
    image: '',
    hp: 5,
    maxHp: 5,
    attack: 0,
    fury: 1,
    currentLayer: 1,
    wraithDestroyAmulet: true,
    ...(over ?? {}),
  } as GameCardData;
}

function makeAmulet(over?: Partial<GameCardData>): GameCardData {
  return {
    id: 'a1',
    type: 'amulet',
    name: '雷击护符',
    value: 5,
    image: '',
    amuletEffect: 'stun-rate-boost' as any,
    ...(over ?? {}),
  } as GameCardData;
}

describe('怨灵诅咒摧毁护符 — Perm routing', () => {
  it('Perm-flagged amulet (recycleDelay = 2 from 附魔祭坛) routes to recycle bag', () => {
    const wraith = makeWraith();
    const permAmulet = makeAmulet({ id: 'perm-amulet', recycleDelay: 2 });

    const state = makeState({
      activeCards: [wraith, null, null, null, null] as any,
      amuletSlots: [permAmulet] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [wraith.id] },
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_MONSTER_TURN_END_EFFECTS' });
    // wraithDestroyAmulet enqueues a 'turnEnd:wraithDestroyAmulet' float that
    // hard-pauses the pipeline before the actual destruction action runs.
    // Auto-release the float queue so the destruction completes synchronously
    // for the test, mimicking what the UI does after the animation plays.
    const next = drainAutoReleasingFloats(r.state, r.enqueuedActions ?? []).state;

    // Amulet removed from amuletSlots
    expect(next.amuletSlots.find(a => a?.id === 'perm-amulet')).toBeUndefined();
    // ...and routed into the permanent magic recycle bag with _recycleWaits = recycleDelay
    const inBag = next.permanentMagicRecycleBag.find(c => c.id === 'perm-amulet') as any;
    expect(inBag).toBeDefined();
    expect(inBag.recycleDelay).toBe(2);
    expect(inBag._recycleWaits).toBe(2);
    // NOT in graveyard (wraith curse never put it there to begin with)
    expect(next.discardedCards.find(c => c.id === 'perm-amulet')).toBeUndefined();
  });

  it('non-Perm amulet preserves original behavior — vanishes without entering recycle bag or graveyard', () => {
    const wraith = makeWraith();
    const plainAmulet = makeAmulet({ id: 'plain-amulet' }); // no recycleDelay

    const state = makeState({
      activeCards: [wraith, null, null, null, null] as any,
      amuletSlots: [plainAmulet] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [wraith.id] },
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_MONSTER_TURN_END_EFFECTS' });
    const next = drainAutoReleasingFloats(r.state, r.enqueuedActions ?? []).state;

    // Amulet removed
    expect(next.amuletSlots.find(a => a?.id === 'plain-amulet')).toBeUndefined();
    // ...and gone — not in recycle bag, not in graveyard (wraith destroy is
    // a vanish, not a graveyard discard, for non-Perm amulets).
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'plain-amulet')).toBeUndefined();
    expect(next.discardedCards.find(c => c.id === 'plain-amulet')).toBeUndefined();
  });

  it('permStripped amulet (凡化咒) is treated as non-Perm even with recycleDelay set', () => {
    // Mirrors the contract enforced by `cardHasPermFlag` and
    // `shouldRouteEquipmentToPermRecycle` for equipment: 凡化咒 marks the
    // card with `permStripped: true`, which overrides any Perm field. The
    // wraith-curse path must respect that override too — otherwise the
    // amulet would "magically" recover Perm 2 status by being re-routed
    // to the recycle bag.
    const wraith = makeWraith();
    const strippedAmulet = makeAmulet({
      id: 'stripped-amulet',
      recycleDelay: 2,
      permStripped: true,
    });

    const state = makeState({
      activeCards: [wraith, null, null, null, null] as any,
      amuletSlots: [strippedAmulet] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [wraith.id] },
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_MONSTER_TURN_END_EFFECTS' });
    const next = drainAutoReleasingFloats(r.state, r.enqueuedActions ?? []).state;

    expect(next.amuletSlots.find(a => a?.id === 'stripped-amulet')).toBeUndefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'stripped-amulet')).toBeUndefined();
    expect(next.discardedCards.find(c => c.id === 'stripped-amulet')).toBeUndefined();
  });

  it('emits the same destruction side effects regardless of Perm status (wraith curse)', () => {
    const wraith = makeWraith();
    const permAmulet = makeAmulet({ id: 'perm-amulet', recycleDelay: 2 });

    const state = makeState({
      activeCards: [wraith, null, null, null, null] as any,
      amuletSlots: [permAmulet] as any,
      combatState: { ...initialCombatState, engagedMonsterIds: [wraith.id] },
    });

    const r = reduce(state, { type: 'APPLY_MONSTER_TURN_END_EFFECTS' });

    // Banner / log / equipment:destroyed events should still fire — Perm
    // routing is purely additive, not a replacement for the curse UX.
    expect(r.sideEffects.some(e =>
      e.event === 'equipment:destroyed' &&
      (e.payload as any).cardId === 'perm-amulet',
    )).toBe(true);
    expect(r.sideEffects.some(e =>
      e.event === 'log:entry' &&
      typeof (e.payload as any).message === 'string' &&
      (e.payload as any).message.includes('怨灵诅咒'),
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// removeAllAmulets event token (骰子事件「摧毁所有护符」) — split routing
// ---------------------------------------------------------------------------

describe('removeAllAmulets event — Perm/non-Perm split routing', () => {
  it('Perm amulets → recycle bag, non-Perm amulets → graveyard (mixed)', () => {
    const permAmulet = makeAmulet({ id: 'perm', name: 'Perm Charm', recycleDelay: 2 });
    const plainAmulet1 = makeAmulet({ id: 'plain-1', name: 'Plain 1' });
    const plainAmulet2 = makeAmulet({ id: 'plain-2', name: 'Plain 2' });

    const state = makeState({
      amuletSlots: [permAmulet, plainAmulet1, plainAmulet2] as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'removeAllAmulets' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.amuletSlots).toHaveLength(0);

    const inBag = next.permanentMagicRecycleBag.find(c => c.id === 'perm') as any;
    expect(inBag).toBeDefined();
    expect(inBag.recycleDelay).toBe(2);
    expect(inBag._recycleWaits).toBe(2);
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'plain-1')).toBeUndefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'plain-2')).toBeUndefined();

    expect(next.discardedCards.find(c => c.id === 'plain-1')).toBeDefined();
    expect(next.discardedCards.find(c => c.id === 'plain-2')).toBeDefined();
    expect(next.discardedCards.find(c => c.id === 'perm')).toBeUndefined();
  });

  it('all-Perm amulets → all routed to recycle bag, graveyard untouched', () => {
    const a1 = makeAmulet({ id: 'p1', name: 'P1', recycleDelay: 2 });
    const a2 = makeAmulet({ id: 'p2', name: 'P2', recycleDelay: 3 });

    const state = makeState({
      amuletSlots: [a1, a2] as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'removeAllAmulets' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.amuletSlots).toHaveLength(0);
    expect(next.discardedCards).toHaveLength(0);

    const bag1 = next.permanentMagicRecycleBag.find(c => c.id === 'p1') as any;
    const bag2 = next.permanentMagicRecycleBag.find(c => c.id === 'p2') as any;
    expect(bag1?._recycleWaits).toBe(2);
    expect(bag2?._recycleWaits).toBe(3);
  });

  it('all-non-Perm amulets → all routed to graveyard, recycle bag untouched (preserves original behavior)', () => {
    // Same shape as the existing reducer.test.ts assertion to confirm we
    // didn't accidentally regress the no-Perm path.
    const a1 = makeAmulet({ id: 'g1', name: 'G1' });
    const a2 = makeAmulet({ id: 'g2', name: 'G2' });

    const state = makeState({
      amuletSlots: [a1, a2] as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'removeAllAmulets' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.amuletSlots).toHaveLength(0);
    expect(next.discardedCards).toHaveLength(2);
    expect(next.permanentMagicRecycleBag).toHaveLength(0);
  });

  it('permStripped amulet (凡化咒) is treated as non-Perm → goes to graveyard, NOT recycle bag', () => {
    const stripped = makeAmulet({
      id: 'stripped',
      name: 'Stripped',
      recycleDelay: 2,
      permStripped: true,
    });

    const state = makeState({
      amuletSlots: [stripped] as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'removeAllAmulets' });
    const next = drain(r.state, r.enqueuedActions ?? []).state;

    expect(next.amuletSlots).toHaveLength(0);
    expect(next.discardedCards.find(c => c.id === 'stripped')).toBeDefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'stripped')).toBeUndefined();
  });

  it('empty amulet slots → no-op patch, banner only', () => {
    const state = makeState({
      amuletSlots: [] as any,
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });

    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'removeAllAmulets' });

    expect(r.state.amuletSlots).toHaveLength(0);
    expect(r.state.discardedCards).toHaveLength(0);
    expect(r.state.permanentMagicRecycleBag).toHaveLength(0);
    expect(r.enqueuedActions ?? []).toHaveLength(0);
  });
});
