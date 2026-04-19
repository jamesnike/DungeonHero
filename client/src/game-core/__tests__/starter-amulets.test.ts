import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
// Ensure card-schema registries (on-equip handlers) are loaded.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as any,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1) 翻血之符 (flip-overkill-lifesteal): every 5 flips → permanentSpellLifesteal +1
// ---------------------------------------------------------------------------

describe('starter amulet: 翻血之符 (flip-overkill-lifesteal)', () => {
  const flipAmulet = {
    id: 'a-flip', type: 'amulet' as const, name: '翻血之符', value: 0,
    amuletEffect: 'flip-overkill-lifesteal' as const,
  };

  function makeFlipCard(id: string) {
    return {
      id,
      type: 'event' as const,
      name: 'Flippable',
      value: 0,
      flipTarget: {
        toCard: {
          id: `${id}-after`,
          type: 'magic' as const,
          name: 'After',
          value: 0,
        },
        destination: 'graveyard' as const,
      },
    };
  }

  it('increments progress on each flip without crossing threshold', () => {
    const state = makeState({
      amuletSlots: [flipAmulet] as any,
      flipOverkillLifestealProgress: 2,
    });
    const action: GameAction = {
      type: 'APPLY_CARD_FLIP',
      card: makeFlipCard('f1') as any,
      cellIndex: null,
    };
    const result = reduce(state, action);
    expect(result.state.flipOverkillLifestealProgress).toBe(3);
    expect(result.state.permanentSpellLifesteal).toBe(0);
  });

  it('triggers permanentSpellLifesteal +1 when crossing 5-flip threshold', () => {
    const state = makeState({
      amuletSlots: [flipAmulet] as any,
      flipOverkillLifestealProgress: 4,
      permanentSpellLifesteal: 2,
    });
    const action: GameAction = {
      type: 'APPLY_CARD_FLIP',
      card: makeFlipCard('f2') as any,
      cellIndex: null,
    };
    const result = reduce(state, action);
    expect(result.state.flipOverkillLifestealProgress).toBe(0);
    expect(result.state.permanentSpellLifesteal).toBe(3);
  });

  it('does nothing when amulet is not equipped', () => {
    const state = makeState({
      amuletSlots: [] as any,
      flipOverkillLifestealProgress: 4,
      permanentSpellLifesteal: 0,
    });
    const action: GameAction = {
      type: 'APPLY_CARD_FLIP',
      card: makeFlipCard('f3') as any,
      cellIndex: null,
    };
    const result = reduce(state, action);
    expect(result.state.flipOverkillLifestealProgress).toBe(4);
    expect(result.state.permanentSpellLifesteal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2) 集甲之符 (equip-amulet-cap): every 6 equips → maxAmuletSlots +1
// ---------------------------------------------------------------------------

describe('starter amulet: 集甲之符 (equip-amulet-cap)', () => {
  const equipAmulet = {
    id: 'a-equip', type: 'amulet' as const, name: '集甲之符', value: 0,
    amuletEffect: 'equip-amulet-cap' as const,
  };

  it('increments progress on each EQUIP_CARD without crossing threshold', () => {
    const weapon = {
      id: 'w1', type: 'weapon' as const, name: 'Sword', value: 1,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 3,
      maxAmuletSlots: 2,
      handCards: [weapon] as any,
    });
    const result = reduce(state, {
      type: 'EQUIP_CARD',
      cardId: 'w1',
      slotId: 'equipmentSlot1',
    });
    expect(result.state.equipAmuletCapProgress).toBe(4);
    expect(result.state.maxAmuletSlots).toBe(2);
  });

  it('triggers maxAmuletSlots +1 when crossing 6-equip threshold', () => {
    const weapon = {
      id: 'w2', type: 'weapon' as const, name: 'Sword', value: 1,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 5,
      maxAmuletSlots: 2,
      handCards: [weapon] as any,
    });
    const result = reduce(state, {
      type: 'EQUIP_CARD',
      cardId: 'w2',
      slotId: 'equipmentSlot1',
    });
    expect(result.state.equipAmuletCapProgress).toBe(0);
    expect(result.state.maxAmuletSlots).toBe(3);
  });

  it('does nothing when amulet is not equipped', () => {
    const weapon = {
      id: 'w3', type: 'weapon' as const, name: 'Sword', value: 1,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [] as any,
      equipAmuletCapProgress: 5,
      maxAmuletSlots: 2,
      handCards: [weapon] as any,
    });
    const result = reduce(state, {
      type: 'EQUIP_CARD',
      cardId: 'w3',
      slotId: 'equipmentSlot1',
    });
    expect(result.state.equipAmuletCapProgress).toBe(5);
    expect(result.state.maxAmuletSlots).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Bug regression: 替换装备 也应计入 集甲之符 计数
  // ---------------------------------------------------------------------------

  it('EQUIP_CARD: 替换被占用的装备槽时也计 +1（容量满 → 顶替原装备）', () => {
    const oldWeapon = {
      id: 'w-old', type: 'weapon' as const, name: 'Old', value: 1,
      durability: 1, maxDurability: 1, fromSlot: 'equipmentSlot1' as const,
    };
    const newWeapon = {
      id: 'w-new', type: 'weapon' as const, name: 'New', value: 3,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 4,
      maxAmuletSlots: 2,
      equipmentSlot1: oldWeapon as any,
      equipmentSlot1Reserve: [] as any,
      equipmentSlotCapacity: { equipmentSlot1: 1, equipmentSlot2: 1 },
      handCards: [newWeapon] as any,
    });
    const result = reduce(state, {
      type: 'EQUIP_CARD',
      cardId: 'w-new',
      slotId: 'equipmentSlot1',
    });
    expect(result.state.equipmentSlot1?.id).toBe('w-new');
    expect(result.state.equipAmuletCapProgress).toBe(5);
  });

  it('EQUIP_CARD: 槽已被占但仍有 reserve 容量 → 入 reserve，不顶替，计 +1', () => {
    const oldWeapon = {
      id: 'w-old', type: 'weapon' as const, name: 'Old', value: 1,
      durability: 1, maxDurability: 1, fromSlot: 'equipmentSlot1' as const,
    };
    const newWeapon = {
      id: 'w-new', type: 'weapon' as const, name: 'New', value: 3,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 4,
      maxAmuletSlots: 2,
      equipmentSlot1: oldWeapon as any,
      equipmentSlot1Reserve: [] as any,
      equipmentSlotCapacity: { equipmentSlot1: 2, equipmentSlot2: 1 },
      handCards: [newWeapon] as any,
    });
    const result = reduce(state, {
      type: 'EQUIP_CARD',
      cardId: 'w-new',
      slotId: 'equipmentSlot1',
    });
    expect(result.state.equipmentSlot1?.id).toBe('w-new');
    expect(result.state.equipmentSlot1Reserve.map(c => c.id)).toEqual(['w-old']);
    expect(result.state.equipAmuletCapProgress).toBe(5);
  });

  it('PLAY_CARD: 从手牌打出装备至空槽时计 +1', () => {
    const newWeapon = {
      id: 'w-play', type: 'weapon' as const, name: 'Sword', value: 2,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 4,
      maxAmuletSlots: 2,
      equipmentSlot1: null,
      equipmentSlot2: null,
      handCards: [newWeapon] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'w-play' } as GameAction]);
    expect(result.state.equipmentSlot1?.id).toBe('w-play');
    expect(result.state.equipAmuletCapProgress).toBe(5);
  });

  it('PLAY_CARD: 两槽都已占且容量满 → 顶替最旧装备，仍计 +1', () => {
    const oldL = {
      id: 'w-L', type: 'weapon' as const, name: 'Left', value: 1,
      durability: 1, maxDurability: 1, fromSlot: 'equipmentSlot1' as const,
    };
    const oldR = {
      id: 'w-R', type: 'weapon' as const, name: 'Right', value: 1,
      durability: 1, maxDurability: 1, fromSlot: 'equipmentSlot2' as const,
    };
    const newWeapon = {
      id: 'w-disp', type: 'weapon' as const, name: 'Displace', value: 3,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 3,
      maxAmuletSlots: 2,
      equipmentSlot1: oldL as any,
      equipmentSlot2: oldR as any,
      equipmentSlot1Reserve: [] as any,
      equipmentSlot2Reserve: [] as any,
      equipmentSlotCapacity: { equipmentSlot1: 1, equipmentSlot2: 1 },
      handCards: [newWeapon] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'w-disp' } as GameAction]);
    expect(result.state.equipmentSlot1?.id).toBe('w-disp');
    expect(result.state.equipAmuletCapProgress).toBe(4);
  });

  it('PLAY_CARD: 6 件后跨过阈值 → 护符栏上限 +1', () => {
    const newWeapon = {
      id: 'w-thr', type: 'weapon' as const, name: 'Threshold', value: 2,
      durability: 1, maxDurability: 1,
    };
    const state = makeState({
      amuletSlots: [equipAmulet] as any,
      equipAmuletCapProgress: 5,
      maxAmuletSlots: 2,
      equipmentSlot1: null,
      handCards: [newWeapon] as any,
    });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: 'w-thr' } as GameAction]);
    expect(result.state.equipAmuletCapProgress).toBe(0);
    expect(result.state.maxAmuletSlots).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3) 眩学之符 (stun-attempt-discover): every 6 stun attempts → discover trigger
// ---------------------------------------------------------------------------

describe('starter amulet: 眩学之符 (stun-attempt-discover)', () => {
  const stunAmulet = {
    id: 'a-stun', type: 'amulet' as const, name: '眩学之符', value: 0,
    amuletEffect: 'stun-attempt-discover' as const,
  };

  it('increments progress on weapon stun-chance dice roll without crossing threshold', () => {
    const weapon = {
      id: 'w-stun', type: 'weapon' as const, name: 'StunSword', value: 5,
      durability: 2, maxDurability: 2,
      weaponStunChance: 100, // guaranteed dice roll
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 5, maxHp: 5, attack: 1, currentLayer: 5, fury: 5,
    };
    const state = makeState({
      equipmentSlot1: weapon as any,
      activeCards: [monster, null, null, null, null] as any,
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 2,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m1'],
        currentTurn: 'hero',
      } as any,
    });
    const drained = drain(state, [
      { type: 'PERFORM_HERO_ATTACK', slotId: 'equipmentSlot1', targetMonsterId: 'm1' },
    ] as any);
    expect(drained.state.stunAttemptDiscoverProgress).toBe(3);
  });

  it('triggers combat:stunAttemptDiscoverTriggered when threshold reached on shield bash', () => {
    const shield = {
      id: 's-bash', type: 'shield' as const, name: 'BashShield', value: 3,
      durability: 3, maxDurability: 3, armorMax: 3,
      shieldBashStunRate: 50, // 50% per armor unit → high threshold
      shieldBashUnlimited: true,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm-stun', type: 'monster' as const, name: 'Boss', value: 9,
      hp: 9, maxHp: 9, attack: 1, currentLayer: 9, fury: 9,
    };
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      amuletSlots: [stunAmulet] as any,
      stunAttemptDiscoverProgress: 5,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-stun'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });
    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-stun',
      diceRoll: 20, // force a fail so we don't get tangled in stun-success branches
    });
    expect(result.state.stunAttemptDiscoverProgress).toBe(0);
    expect(
      result.sideEffects.some(e => e.event === 'combat:stunAttemptDiscoverTriggered'),
    ).toBe(true);
  });

  it('does nothing when amulet is not equipped (shield bash)', () => {
    const shield = {
      id: 's-bash-2', type: 'shield' as const, name: 'BashShield', value: 3,
      durability: 3, maxDurability: 3, armorMax: 3,
      shieldBashStunRate: 50,
      shieldBashUnlimited: true,
      fromSlot: 'equipmentSlot1' as const,
    };
    const monster = {
      id: 'm-stun-2', type: 'monster' as const, name: 'Boss', value: 9,
      hp: 9, maxHp: 9, attack: 1, currentLayer: 9, fury: 9,
    };
    const state = makeState({
      equipmentSlot1: shield as any,
      activeCards: [monster, null, null, null, null] as any,
      amuletSlots: [] as any,
      stunAttemptDiscoverProgress: 5,
      combatState: {
        ...initialCombatState,
        engagedMonsterIds: ['m-stun-2'],
        currentTurn: 'hero',
        heroAttacksRemaining: 2,
      } as any,
    });
    const result = reduce(state, {
      type: 'PERFORM_SHIELD_BASH',
      slotId: 'equipmentSlot1',
      targetMonsterId: 'm-stun-2',
      diceRoll: 20,
    });
    expect(result.state.stunAttemptDiscoverProgress).toBe(5);
    expect(
      result.sideEffects.some(e => e.event === 'combat:stunAttemptDiscoverTriggered'),
    ).toBe(false);
  });
});
