/**
 * 翻转之契 (Pact of Reversal) — event card tests.
 *
 * Covers:
 *   - Option 1 (flipAllActiveRow): flips all flippable cards in active row.
 *   - Option 2 (grantActiveRowFlip): adds 乾坤一翻 to backpack.
 *   - Option 3 token (flipToFlipPersuadeAmulet): event → 翻印之符 amulet (backpack).
 *   - persuade-on-flip amulet: stacks persuadeAmuletBonus on every forward flip.
 *   - flipDebuffMonsterId: cleared on waterfall and when monster leaves row.
 *   - _flipRepairBuff: durability +1 on flip for marked equipment.
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { createStarterCardPool, STARTER_CARD_IDS } from '../deck';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

// Minimal flippable potion: flipping turns it into a goldGain marker so we can
// assert APPLY_CARD_FLIP routed through the reducer (not just a back-flip patch).
function makeFlippablePotion(id: string, toName = 'flipped'): GameCardData {
  return {
    id, type: 'potion', name: `pot-${id}`, value: 0,
    flipTarget: {
      toCard: { id: `${id}-flipped`, type: 'potion', name: toName, value: 0 } as GameCardData,
      destination: 'graveyard',
    },
  } as GameCardData;
}

function makeBackFlipped(id: string): GameCardData {
  return {
    id, type: 'potion', name: `back-${id}`, value: 0,
    _flipBackCard: { id: `${id}-orig`, type: 'potion', name: `orig-${id}`, value: 0 } as GameCardData,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// Option 1 — flipAllActiveRow
// ---------------------------------------------------------------------------

describe('翻转之契 option 1 — flipAllActiveRow', () => {
  it('enqueues APPLY_CARD_FLIP for forward-flippable cards and patches back-flips inline', () => {
    const fwd = makeFlippablePotion('p1');
    const back = makeBackFlipped('p2');
    const inert = { id: 'p3', type: 'potion', name: 'inert', value: 0 } as GameCardData;
    const active: ActiveRowSlots = [fwd, null, back, inert, null];
    const state = makeState({ activeCards: active });

    const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'flipAllActiveRow' } as GameAction);

    // Forward flip → enqueued APPLY_CARD_FLIP for p1
    const flipActions = result.enqueuedActions.filter(a => a.type === 'APPLY_CARD_FLIP');
    expect(flipActions).toHaveLength(1);
    expect((flipActions[0] as any).cellIndex).toBe(0);
    expect((flipActions[0] as any).card.id).toBe('p1');

    // Back flip — patched inline at index 2; p2 → p2-orig
    expect(result.state.activeCards[2]?.id).toBe('p2-orig');
    expect(result.state.activeCards[3]).toBe(inert); // untouched
    expect(result.state.activeCards[1]).toBeNull();

    // Side effect: card:flippedInCell emitted for back flip
    const flippedInCell = result.sideEffects.filter(e => e.event === 'card:flippedInCell');
    expect(flippedInCell.length).toBe(1);
    expect((flippedInCell[0].payload as any).cellIndex).toBe(2);
  });

  it('logs a no-op message when nothing in the row is flippable', () => {
    const inert = { id: 'p1', type: 'potion', name: 'inert', value: 0 } as GameCardData;
    const state = makeState({ activeCards: [inert, null, null, null, null] });
    const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'flipAllActiveRow' } as GameAction);
    expect(result.state.activeCards[0]).toBe(inert);
    expect(result.enqueuedActions.filter(a => a.type === 'APPLY_CARD_FLIP')).toHaveLength(0);
    expect(result.state.heroSkillBanner).toContain('没有');
  });
});

// ---------------------------------------------------------------------------
// Option 2 — grantActiveRowFlip
// ---------------------------------------------------------------------------

describe('翻转之契 option 2 — grantActiveRowFlip', () => {
  it('adds a fresh 乾坤一翻 instance to the backpack', () => {
    const state = makeState({ backpackItems: [] });
    const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantActiveRowFlip' } as GameAction);

    const template = createStarterCardPool().find(c => c.id === STARTER_CARD_IDS.activeRowFlip)!;
    const granted = result.state.backpackItems.find(c => c.name === template.name);
    expect(granted).toBeDefined();
    // Fresh unique id (not the starter template id)
    expect(granted!.id).not.toBe(template.id);
    expect(granted!.magicType).toBe(template.magicType);
    expect(granted!.magicEffect).toBe(template.magicEffect);
  });
});

// ---------------------------------------------------------------------------
// Option 3 — persuade-on-flip amulet
// ---------------------------------------------------------------------------

describe('翻印之符 (persuade-on-flip amulet)', () => {
  it('grants persuadeAmuletBonus +10% per forward flip while equipped', () => {
    const amulet: GameCardData = {
      id: 'amu-flip-print', type: 'amulet', name: '翻印之符', value: 0,
      amuletEffect: 'persuade-on-flip',
    } as GameCardData;
    const fwd = makeFlippablePotion('p-flip');
    const state = makeState({
      amuletSlots: [amulet] as any,
      activeCards: [fwd, null, null, null, null],
      persuadeAmuletBonus: 0,
    });
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    expect(result.state.persuadeAmuletBonus).toBe(10);
  });

  it('stacks across multiple persuade-on-flip amulets (10% each)', () => {
    const a1: GameCardData = {
      id: 'a1', type: 'amulet', name: '翻印之符', value: 0,
      amuletEffect: 'persuade-on-flip',
    } as GameCardData;
    const a2: GameCardData = { ...a1, id: 'a2' } as GameCardData;
    const fwd = makeFlippablePotion('p-flip');
    const state = makeState({
      amuletSlots: [a1, a2] as any,
      activeCards: [fwd, null, null, null, null],
      persuadeAmuletBonus: 5,
    });
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    expect(result.state.persuadeAmuletBonus).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Option 4 — flipDebuffMonsterId
// ---------------------------------------------------------------------------

describe('翻覆震慑 (flipDebuffMonsterId)', () => {
  it('reduces the targeted monster attack by 1 on every forward flip (min 0)', () => {
    const monster: GameCardData = {
      id: 'm1', type: 'monster', name: 'Goblin', value: 4,
      hp: 5, maxHp: 5, attack: 4, fury: 1, currentLayer: 1,
    } as GameCardData;
    const fwd = makeFlippablePotion('p-mon-debuff');
    const state = makeState({
      activeCards: [fwd, null, monster, null, null],
      flipDebuffMonsterId: 'm1',
    });
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    const updated = result.state.activeCards[2]!;
    expect(updated.attack).toBe(3);
    expect(result.state.flipDebuffMonsterId).toBe('m1');
  });

  it('clears flipDebuffMonsterId when the target is no longer in the active row', () => {
    const fwd = makeFlippablePotion('p-mon-gone');
    const state = makeState({
      activeCards: [fwd, null, null, null, null],
      flipDebuffMonsterId: 'gone',
    });
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    expect(result.state.flipDebuffMonsterId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Option 6 — _flipRepairBuff
// ---------------------------------------------------------------------------

describe('熔铸耐久 (_flipRepairBuff)', () => {
  it('repairs +1 durability on every forward flip for marked equipment', () => {
    const sword: EquipmentItem = {
      id: 'w1', type: 'weapon', name: 'Sword', value: 2,
      durability: 1, maxDurability: 3,
      _flipRepairBuff: true,
    } as EquipmentItem;
    const fwd = makeFlippablePotion('p-repair');
    const state = makeState({
      activeCards: [fwd, null, null, null, null],
      equipmentSlot1: sword,
    });
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    expect((result.state.equipmentSlot1 as any)?.durability).toBe(2);
  });

  it('does not over-repair past maxDurability', () => {
    const shield: EquipmentItem = {
      id: 's1', type: 'shield', name: 'Shield', value: 2,
      durability: 3, maxDurability: 3,
      _flipRepairBuff: true,
    } as EquipmentItem;
    const fwd = makeFlippablePotion('p-repair2');
    const state = makeState({
      activeCards: [fwd, null, null, null, null],
      equipmentSlot1: shield,
    });
    const result = reduce(state, { type: 'APPLY_CARD_FLIP', card: fwd, cellIndex: 0 } as GameAction);
    expect((result.state.equipmentSlot1 as any)?.durability).toBe(3);
  });
});
