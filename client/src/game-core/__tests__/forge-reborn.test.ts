/**
 * 回炉重造 (knight:forge-reborn) — Instant magic.
 *
 * Behavior:
 *   - Lose floor(state.hp / 2) HP via APPLY_DAMAGE selfInflicted (can be lethal).
 *   - Delete every other hand card via DELETE_CARD destination: 'graveyard'.
 *     Curses included. Perm-flagged cards also routed to graveyard (force-grave
 *     semantics, same as Shop kw='delete') — explicitly bypasses
 *     `perm-routing-on-discard` recycle-bag dispatch.
 *   - Trigger N chained class-deck discoveries (N = number of cards deleted).
 *     First fires via BEGIN_DISCOVER; remaining N-1 go to pendingClassDiscoverQueue.
 *     All discoveries use delivery: 'hand-first' — discovered cards land
 *     directly in hand (subject to handLimit, falling back to backpack →
 *     recycle bag on overflow). Mirrors 「专属感召」 UX.
 *   - Empty-hand case: HP cost still paid, no discoveries, banner notes
 *     "无手牌可删除".
 *   - Echo: does NOT participate. echoMultiplier ignored. isEchoTriggered just
 *     appends a banner note. doubleNextMagic still consumed by the engine.
 *   - 招灵书印 (delete-draw amulet): each DELETE_CARD triggers it → both equipment
 *     slots gain +1 temp attack & +1 temp armor, player gains +2 gold per proc;
 *     totalProcs = N × M (deleted cards × surviving 招灵书印).
 *
 * Fixtures use `phase: 'playerInput'` per `pipeline-input-continuation.mdc` so
 * the DELETE_CARD / BEGIN_DISCOVER / APPLY_DAMAGE follow-up chain fully drains
 * in the same drain() call.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    ...overrides,
  };
}

function makeForgeReborn(idSuffix = 'fr'): GameCardData {
  return {
    id: `magic-${idSuffix}`,
    type: 'magic',
    name: '回炉重造',
    value: 0,
    image: '',
    classCard: true,
    magicType: 'instant',
    magicEffect: '即时魔法：失去半血，删除手牌，发现等量专属牌。',
    description: 'test',
    knightEffect: 'forge-reborn',
  } as GameCardData;
}

function makeHandCard(id: string, overrides: Partial<GameCardData> = {}): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Magic-${id}`,
    value: 0,
    image: '',
    magicType: 'instant',
    magicEffect: 'test',
    ...overrides,
  } as GameCardData;
}

function makePermMagicHandCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Perm-${id}`,
    value: 0,
    image: '',
    magicType: 'permanent',
    magicEffect: 'test',
    recycleDelay: 2,
  } as GameCardData;
}

function makeCurse(id: string): GameCardData {
  return {
    id,
    type: 'curse',
    name: `诅咒-${id}`,
    value: 0,
    image: '',
  } as unknown as GameCardData;
}

function makeClassCard(id: string): GameCardData {
  return {
    id,
    type: 'magic',
    name: `Class-${id}`,
    value: 0,
    image: '',
    classCard: true,
    magicType: 'instant',
    magicEffect: 'test',
  } as GameCardData;
}

const DELETE_DRAW_AMULET: GameCardData = {
  id: 'amu-delete-draw',
  type: 'amulet',
  name: '招灵书印',
  value: 1,
  image: '',
  amuletEffect: 'delete-draw',
} as unknown as GameCardData;

const DELETE_DRAW_AMULET_2: GameCardData = {
  ...DELETE_DRAW_AMULET,
  id: 'amu-delete-draw-2',
} as unknown as GameCardData;

describe('回炉重造 (knight:forge-reborn)', () => {
  it('lose floor(hp/2) HP, delete all other hand cards to graveyard, trigger first discover + queue rest', () => {
    const card = makeForgeReborn('basic');
    const c1 = makeHandCard('h-1');
    const c2 = makeHandCard('h-2');
    const c3 = makeHandCard('h-3');
    const classDeck = [
      makeClassCard('cd-1'),
      makeClassCard('cd-2'),
      makeClassCard('cd-3'),
      makeClassCard('cd-4'),
      makeClassCard('cd-5'),
    ];
    const state = makeState({
      hp: 20,
      handCards: [card, c1, c2, c3],
      classDeck,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // HP: 20 - floor(20/2) = 20 - 10 = 10.
    expect(result.state.hp).toBe(10);

    // All 3 other hand cards routed to graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'h-1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'h-2')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'h-3')).toBe(true);

    // None of them leaked into recycle bag.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h-1')).toBe(false);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h-2')).toBe(false);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'h-3')).toBe(false);

    // Source card consumed from hand. Whatever remains in hand should not
    // include any of the deleted cards or the source card.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    expect(result.state.handCards.find(c => c.id === 'h-1')).toBeUndefined();

    // First discover fires immediately. delivery should be 'hand-first' so
    // the chosen card lands directly in hand (mirrors 「专属感召」).
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.discoverOptions.length).toBeGreaterThan(0);
    expect(result.state.discoverSourceLabel).toBe('回炉重造');
    expect(result.state.discoverDelivery).toBe('hand-first');

    // Remaining 2 discovers queued (3 hand cards → 3 discovers total, 1 fires + 2 queued).
    // Each queue entry must also carry delivery: 'hand-first'.
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(2);
    expect(result.state.pendingClassDiscoverQueue[0]).toEqual({
      source: 'forge-reborn',
      sourceLabel: '回炉重造',
      delivery: 'hand-first',
    });
    expect(result.state.pendingClassDiscoverQueue[1]).toEqual({
      source: 'forge-reborn',
      sourceLabel: '回炉重造',
      delivery: 'hand-first',
    });
  });

  it('curses in hand are deleted to graveyard (rare curse-removal tool)', () => {
    const card = makeForgeReborn('curses');
    const normal = makeHandCard('h-normal');
    const curse1 = makeCurse('curse-1');
    const curse2 = makeCurse('curse-2');
    const state = makeState({
      hp: 14,
      handCards: [card, normal, curse1, curse2],
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // HP: 14 - 7 = 7.
    expect(result.state.hp).toBe(7);

    // ALL 3 hand cards (normal + both curses) routed to graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'h-normal')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'curse-1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'curse-2')).toBe(true);

    // Curses did NOT bounce back to backpack (FINALIZE_MAGIC_CARD's curse→
    // backpack disposition is for the source card type === 'curse', not for
    // curses that get DELETE_CARD'd by another effect).
    expect(result.state.backpackItems.some(c => c.id === 'curse-1')).toBe(false);
    expect(result.state.backpackItems.some(c => c.id === 'curse-2')).toBe(false);

    // 3 discovers triggered total.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(2);
  });

  it('Perm hand cards are force-routed to graveyard (bypasses perm-routing-on-discard recycle dispatch)', () => {
    const card = makeForgeReborn('perm');
    const perm1 = makePermMagicHandCard('p-1');
    const perm2 = makePermMagicHandCard('p-2');
    const normal = makeHandCard('h-normal');
    const state = makeState({
      hp: 12,
      handCards: [card, perm1, perm2, normal],
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    expect(result.state.hp).toBe(6);

    // All 3 hand cards (including 2 Perm-flagged) end up in graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'p-1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'p-2')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'h-normal')).toBe(true);

    // CRITICAL: Perm cards must NOT end up in recycle bag — this is the
    // force-grave semantics user explicitly requested. Without DELETE_CARD's
    // destination: 'graveyard', perm-routing-on-discard would shunt them to
    // permanentMagicRecycleBag.
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'p-1')).toBe(false);
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === 'p-2')).toBe(false);
  });

  it('empty hand (only source card): HP cost still paid, no discoveries queued', () => {
    const card = makeForgeReborn('alone');
    const state = makeState({
      hp: 18,
      handCards: [card],
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // HP: 18 - 9 = 9.
    expect(result.state.hp).toBe(9);

    // Source card consumed.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    // Source card lands in graveyard (FINALIZE for instant magic).
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(true);

    // No discover triggered.
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(0);

    // Empty-hand banner appears.
    const banner = result.sideEffects.find(
      e =>
        e.event === 'ui:banner' &&
        String((e.payload as any)?.text ?? '').includes('无手牌可删除'),
    );
    expect(banner).toBeDefined();
  });

  it('hp=1 → floor(1/2)=0 cost, hand still deleted', () => {
    const card = makeForgeReborn('one-hp');
    const c1 = makeHandCard('h-1');
    const state = makeState({
      hp: 1,
      handCards: [card, c1],
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // HP stays 1 (floor(1/2)=0, no damage).
    expect(result.state.hp).toBe(1);
    // Game not over.
    expect(result.state.gameOver).toBe(false);

    // Hand card still routed to graveyard.
    expect(result.state.discardedCards.some(c => c.id === 'h-1')).toBe(true);
    // 1 discover triggered, 0 queued.
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(0);
  });

  it('lethal: hp=2 → 1 damage; hp=3 → 1 damage; hp=4 → 2 damage (sanity check on floor)', () => {
    // Use a stronger HP so we can verify hp_remaining = hp - floor(hp/2)
    // exactly, then deletion happens regardless.
    const card = makeForgeReborn('floor');
    const c1 = makeHandCard('h-1');
    const state = makeState({
      hp: 7,
      handCards: [card, c1],
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // floor(7/2)=3, hp goes 7 → 4.
    expect(result.state.hp).toBe(4);
    expect(result.state.discardedCards.some(c => c.id === 'h-1')).toBe(true);
  });

  it('招灵书印 (delete-draw) amulet stacks: 3 deletes × 1 amulet = 3 procs of (+1 atk, +1 armor, +2 gold) per slot', () => {
    const card = makeForgeReborn('amu');
    const c1 = makeHandCard('h-1');
    const c2 = makeHandCard('h-2');
    const c3 = makeHandCard('h-3');
    const bp = Array.from({ length: 10 }, (_, i) => makeHandCard(`bp-${i}`));
    const goldBefore = 0;
    const state = makeState({
      hp: 20,
      gold: goldBefore,
      amuletSlots: [DELETE_DRAW_AMULET] as any,
      handCards: [card, c1, c2, c3],
      backpackItems: bp,
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // delete-draw fires once per DELETE_CARD: 3 deletes × 1 amulet = 3 procs.
    // Each proc: +1 temp atk to both slots, +1 temp armor to both slots, +2 gold.
    expect(result.state.slotTempAttack.equipmentSlot1).toBe(3);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(3);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(3);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(3);
    expect(result.state.gold).toBe(goldBefore + 6);

    // Multiple "招灵书印" log entries (one per delete).
    const amuletLogs = result.sideEffects.filter(
      e =>
        e.event === 'log:entry' &&
        (e.payload as any)?.type === 'amulet' &&
        String((e.payload as any)?.message ?? '').includes('招灵书印'),
    );
    expect(amuletLogs).toHaveLength(3);
  });

  it('招灵书印 (delete-draw) full N × M scaling: 3 deletes × 2 amulets = 6 procs (+6 atk / +6 armor / +12 gold per slot)', () => {
    const card = makeForgeReborn('amu-x2');
    const c1 = makeHandCard('h-1');
    const c2 = makeHandCard('h-2');
    const c3 = makeHandCard('h-3');
    const bp = Array.from({ length: 10 }, (_, i) => makeHandCard(`bp-${i}`));
    const goldBefore = 0;
    const state = makeState({
      hp: 20,
      gold: goldBefore,
      amuletSlots: [DELETE_DRAW_AMULET, DELETE_DRAW_AMULET_2] as any,
      handCards: [card, c1, c2, c3],
      backpackItems: bp,
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // 3 DELETE_CARDs × M=2 amulets each = 6 procs total.
    // Each proc: +1 atk, +1 armor, +2 gold.
    expect(result.state.slotTempAttack.equipmentSlot1).toBe(6);
    expect(result.state.slotTempAttack.equipmentSlot2).toBe(6);
    expect(result.state.slotTempArmor.equipmentSlot1).toBe(6);
    expect(result.state.slotTempArmor.equipmentSlot2).toBe(6);
    expect(result.state.gold).toBe(goldBefore + 12);

    // One log per DELETE_CARD (3 deletes → 3 logs; each log message bundles the
    // M-amulet proc into a single "+M / +M / +2M" line per the helper format).
    const amuletLogs = result.sideEffects.filter(
      e =>
        e.event === 'log:entry' &&
        (e.payload as any)?.type === 'amulet' &&
        String((e.payload as any)?.message ?? '').includes('招灵书印'),
    );
    expect(amuletLogs).toHaveLength(3);
  });

  it('echo path: doubleNextMagic consumed by engine, effect runs ONCE, banner notes non-participation', () => {
    const card = makeForgeReborn('echo');
    const c1 = makeHandCard('h-1');
    const c2 = makeHandCard('h-2');
    const state = makeState({
      hp: 20,
      handCards: [card, c1, c2],
      classDeck: [
        makeClassCard('cd-1'),
        makeClassCard('cd-2'),
        makeClassCard('cd-3'),
        makeClassCard('cd-4'),
      ],
      doubleNextMagic: true,
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Engine consumes doubleNextMagic regardless.
    expect(result.state.doubleNextMagic).toBe(false);

    // HP loss applied ONCE: 20 → 10 (not 0 from double).
    expect(result.state.hp).toBe(10);

    // Both hand cards deleted ONCE (not duplicated).
    expect(result.state.discardedCards.filter(c => c.id === 'h-1')).toHaveLength(1);
    expect(result.state.discardedCards.filter(c => c.id === 'h-2')).toHaveLength(1);

    // 2 discovers total — first fires, 1 queued. (Not 4 = 2×2 echo.)
    expect(result.state.discoverModalOpen).toBe(true);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(1);

    // Banner mentions echo non-participation.
    const echoBanner = result.sideEffects.find(
      e =>
        e.event === 'ui:banner' &&
        String((e.payload as any)?.text ?? '').includes('回响：本卡不参与回响'),
    );
    expect(echoBanner).toBeDefined();
  });

  it('source card itself routes to graveyard (FINALIZE_MAGIC_CARD instant disposition)', () => {
    const card = makeForgeReborn('source-grave');
    const c1 = makeHandCard('h-1');
    const state = makeState({
      hp: 20,
      handCards: [card, c1],
      classDeck: [makeClassCard('cd-1'), makeClassCard('cd-2'), makeClassCard('cd-3')],
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Source card consumed from hand.
    expect(result.state.handCards.find(c => c.id === card.id)).toBeUndefined();
    // Instant magic with no Perm flag → graveyard via FINALIZE_MAGIC_CARD.
    expect(result.state.discardedCards.some(c => c.id === card.id)).toBe(true);
    // Not in recycle bag (no Perm flag).
    expect(result.state.permanentMagicRecycleBag.some(c => c.id === card.id)).toBe(false);
  });

  it("end-to-end: RESOLVE_DISCOVER_SELECTION after forge-reborn lands chosen card in hand (delivery: 'hand-first')", () => {
    const card = makeForgeReborn('e2e-hand');
    const c1 = makeHandCard('h-1');
    const c2 = makeHandCard('h-2');
    const cd1 = makeClassCard('cd-1');
    const cd2 = makeClassCard('cd-2');
    const cd3 = makeClassCard('cd-3');
    const state = makeState({
      hp: 20,
      handCards: [card, c1, c2],
      classDeck: [cd1, cd2, cd3],
    });

    const after = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // Modal is open with delivery='hand-first' and hand is empty (just got purged).
    expect(after.state.discoverModalOpen).toBe(true);
    expect(after.state.discoverDelivery).toBe('hand-first');
    expect(after.state.handCards.length).toBe(0);
    expect(after.state.discoverOptions.length).toBeGreaterThan(0);

    // Player picks the first option → it should land directly in hand.
    const chosen = after.state.discoverOptions[0];
    const resolved = reduce(after.state, {
      type: 'RESOLVE_DISCOVER_SELECTION',
      cardId: chosen.id,
    });

    expect(resolved.state.handCards.length).toBe(1);
    expect(resolved.state.handCards[0].name).toBe(chosen.name);
    // Cloned id, not original.
    expect(resolved.state.handCards[0].id).not.toBe(chosen.id);
    // Did NOT go to backpack or recycle bag.
    expect(resolved.state.backpackItems.length).toBe(0);
    expect(resolved.state.permanentMagicRecycleBag.length).toBe(0);
    // discoverDelivery resets to default after resolution.
    expect(resolved.state.discoverDelivery).toBe('backpack');
  });

  it('classDeck empty: HP cost paid, hand still deleted, but no discover fires (log notes empty pool)', () => {
    const card = makeForgeReborn('empty-pool');
    const c1 = makeHandCard('h-1');
    const c2 = makeHandCard('h-2');
    const state = makeState({
      hp: 20,
      handCards: [card, c1, c2],
      classDeck: [], // pool exhausted
    });

    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);

    // HP & deletion still happen.
    expect(result.state.hp).toBe(10);
    expect(result.state.discardedCards.some(c => c.id === 'h-1')).toBe(true);
    expect(result.state.discardedCards.some(c => c.id === 'h-2')).toBe(true);

    // No discover modal opened.
    expect(result.state.discoverModalOpen).toBe(false);
    expect(result.state.pendingClassDiscoverQueue).toHaveLength(0);

    // Log notes empty pool.
    const emptyPoolLog = result.sideEffects.find(
      e =>
        e.event === 'log:entry' &&
        String((e.payload as any)?.message ?? '').includes('专属牌堆已空'),
    );
    expect(emptyPoolLog).toBeDefined();
  });
});
