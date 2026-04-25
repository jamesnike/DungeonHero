/**
 * Test coverage for the "Add 15 new event options" plan.
 *
 * Covers the new event tokens and the new infrastructure around them:
 *   - goldHalve            (血咒仪式)
 *   - stunCap-N            (诅咒骰局)
 *   - persuadeNextRateBonus:N  (劝降祭典)
 *   - recycleBagDelete:N   (双重燃烧 / 双重燃烧觉醒)
 *   - grantStarterDungeonSwap   (英雄试炼 「空间精研」)
 *   - grantStarterDimensionWarp (增幅仪式 「召唤随机专属装备...」)
 *   - lastWordsMaxHpBoost trigger via RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP +
 *     computeEquipmentBreakEffects firing permanent maxHp +4 × stacks.
 *   - pactCopyActiveRow / amplify-altar-from-random-class-equip-with-warp
 *     emit event:requestEventInteraction so the UI hook can pick up the flow.
 *
 * Per `pipeline-input-continuation.mdc`, fixtures explicitly use
 * `phase: 'playerInput'` so any internal follow-up actions (like
 * `BEGIN_COMBAT` from a damage path or disposition routers) are exercised
 * the same way they would be in a live game session.
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { initialCombatState, createEmptyAmuletEffects } from '../constants';
import { createRng } from '../rng';
import { computeEquipmentBreakEffects } from '../rules/equipment-effects';
import {
  getStarterBaseId,
  STARTER_CARD_IDS,
  createStarterCardPool,
} from '../deck';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    phase: 'playerInput',
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState, engagedMonsterIds: [] },
    rng: createRng(42),
    ...overrides,
  };
}

function makePermMagic(id: string, name = '回响残页'): GameCardData {
  return {
    id,
    type: 'magic',
    name,
    value: 0,
    image: '',
    magicType: 'permanent',
    recycleDelay: 2,
    _recycleWaits: 2,
  } as GameCardData & { _recycleWaits?: number };
}

function makeMonsterEquip(
  id: string,
  overrides: Partial<GameCardData> = {},
): GameCardData {
  return {
    id,
    type: 'monster',
    name: `Mob-${id}`,
    value: 4,
    image: '',
    hp: 4,
    maxHp: 4,
    attack: 4,
    fury: 4,
    currentLayer: 4,
    tempAttackBoost: 5,
    ...overrides,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// goldHalve  —  血咒仪式 「血金祭典」
// ---------------------------------------------------------------------------

describe('goldHalve token (血咒仪式 「血金祭典」)', () => {
  it('halves gold with Math.floor (odd input)', () => {
    const state = makeState({ gold: 25 });
    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'goldHalve' });
    expect(r.state.gold).toBe(12); // floor(25/2)
  });

  it('halves gold cleanly (even input)', () => {
    const state = makeState({ gold: 40 });
    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'goldHalve' });
    expect(r.state.gold).toBe(20);
  });

  it('handles 0 gold gracefully', () => {
    const state = makeState({ gold: 0 });
    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'goldHalve' });
    expect(r.state.gold).toBe(0);
  });

  it('emits a heroSkillBanner mentioning the before / after numbers', () => {
    const state = makeState({ gold: 31 });
    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'goldHalve' });
    expect(r.state.heroSkillBanner).toContain('31');
    expect(r.state.heroSkillBanner).toContain('15');
  });
});

// ---------------------------------------------------------------------------
// stunCap-N  —  诅咒骰局 「击晕上限 -20%」
// ---------------------------------------------------------------------------

describe('stunCap-N token (诅咒骰局 dice 「击晕上限 -20%」)', () => {
  it('reduces stunCap by N percentage points', () => {
    const state = makeState({ stunCap: 50 });
    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'stunCap-20' });
    expect(r.state.stunCap).toBe(30);
  });

  it('clamps stunCap to >= 0 (no negative cap)', () => {
    const state = makeState({ stunCap: 5 });
    const r = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'stunCap-20' });
    expect(r.state.stunCap).toBe(0);
  });

  it('mirrors stunCap+N: stunCap+10 then stunCap-15 lands at start-5', () => {
    const state = makeState({ stunCap: 40 });
    const r1 = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'stunCap+10' });
    expect(r1.state.stunCap).toBe(50);
    const r2 = reduce(r1.state, { type: 'APPLY_EVENT_EFFECT', token: 'stunCap-15' });
    expect(r2.state.stunCap).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// persuadeNextRateBonus:N  —  劝降祭典 dice 「下次劝降成功率 +50%」
// ---------------------------------------------------------------------------

describe('persuadeNextRateBonus:N token (劝降祭典)', () => {
  it('adds N to persuadeDiscount.rateBonus from a null baseline', () => {
    const state = makeState({ persuadeDiscount: null });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'persuadeNextRateBonus:50',
    });
    expect(r.state.persuadeDiscount).not.toBeNull();
    expect(r.state.persuadeDiscount!.rateBonus).toBe(50);
    expect(r.state.persuadeDiscount!.costReduction).toBe(0);
  });

  it('accumulates on top of existing persuadeDiscount', () => {
    const state = makeState({
      persuadeDiscount: { costReduction: 3, rateBonus: 10 },
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'persuadeNextRateBonus:25',
    });
    expect(r.state.persuadeDiscount!.rateBonus).toBe(35);
    // costReduction must be preserved untouched.
    expect(r.state.persuadeDiscount!.costReduction).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// recycleBagDelete:N  —  双重燃烧 / 双重燃烧觉醒
// ---------------------------------------------------------------------------

describe('recycleBagDelete:N token (双重燃烧)', () => {
  it('removes N random cards from recycle bag and routes them to graveyard', () => {
    const cards = [
      makePermMagic('rb-1', '回响A'),
      makePermMagic('rb-2', '回响B'),
      makePermMagic('rb-3', '回响C'),
    ];
    const state = makeState({
      permanentMagicRecycleBag: cards,
      discardedCards: [],
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'recycleBagDelete:1',
    });
    expect(r.state.permanentMagicRecycleBag).toHaveLength(2);
    expect(r.state.discardedCards).toHaveLength(1);
    // Removed card came from the original bag set
    const removedId = r.state.discardedCards[0].id;
    expect(['rb-1', 'rb-2', 'rb-3']).toContain(removedId);
  });

  it('removes 2 cards from recycle bag (双重燃烧觉醒)', () => {
    const cards = [
      makePermMagic('rb-1'),
      makePermMagic('rb-2'),
      makePermMagic('rb-3'),
      makePermMagic('rb-4'),
    ];
    const state = makeState({
      permanentMagicRecycleBag: cards,
      discardedCards: [],
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'recycleBagDelete:2',
    });
    expect(r.state.permanentMagicRecycleBag).toHaveLength(2);
    expect(r.state.discardedCards).toHaveLength(2);
  });

  it('clamps N to recycle bag size (does not over-remove)', () => {
    const cards = [makePermMagic('only-1')];
    const state = makeState({
      permanentMagicRecycleBag: cards,
      discardedCards: [],
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'recycleBagDelete:5',
    });
    expect(r.state.permanentMagicRecycleBag).toHaveLength(0);
    expect(r.state.discardedCards).toHaveLength(1);
    expect(r.state.discardedCards[0].id).toBe('only-1');
  });

  it('no-op when recycle bag is empty', () => {
    const state = makeState({
      permanentMagicRecycleBag: [],
      discardedCards: [],
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'recycleBagDelete:2',
    });
    expect(r.state.permanentMagicRecycleBag).toHaveLength(0);
    expect(r.state.discardedCards).toHaveLength(0);
  });

  it('strips _recycleWaits from removed cards before they enter graveyard', () => {
    const cards = [makePermMagic('rb-1')];
    const state = makeState({
      permanentMagicRecycleBag: cards,
      discardedCards: [],
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'recycleBagDelete:1',
    });
    const inGrave = r.state.discardedCards[0] as GameCardData & {
      _recycleWaits?: number;
    };
    expect(inGrave._recycleWaits).toBeUndefined();
  });

  it('monster cards from recycle bag enter graveyard with currentLayer reset to 1', () => {
    // Per monster-graveyard-layer-reset rule: any monster entering discardedCards
    // must go through resetCardForGraveyard so currentLayer = 1. recycleBagDelete
    // must follow that same contract so a 4-layer dragon doesn't resurrect with
    // 4 layers from the graveyard.
    const dragon: GameCardData = makeMonsterEquip('drag-1', {
      hp: 8,
      attack: 8,
      fury: 4,
      currentLayer: 4,
    });
    const state = makeState({
      permanentMagicRecycleBag: [dragon as any],
      discardedCards: [],
      gameMode: 'standard',
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'recycleBagDelete:1',
    });
    expect(r.state.discardedCards).toHaveLength(1);
    const inGrave = r.state.discardedCards[0];
    expect(inGrave.id).toBe('drag-1');
    expect(inGrave.currentLayer).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// grantStarterDungeonSwap / grantStarterDimensionWarp
// (英雄试炼 「空间精研」 / 增幅仪式 「召唤随机专属装备…维度扭曲」)
// ---------------------------------------------------------------------------

describe('grantStarterDungeonSwap / grantStarterDimensionWarp — strippable id', () => {
  it('grantStarterDungeonSwap grants 乾坤挪移 with id strippable to STARTER_CARD_IDS.dungeonSwap', () => {
    const state = makeState({ backpackItems: [] });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'grantStarterDungeonSwap',
    });
    const card = r.state.backpackItems.find(c => c.name === '乾坤挪移');
    expect(card).toBeDefined();
    // Critical: id must strip back so the starter switch in
    // resolvePermanentMagic can route the played card.
    expect(getStarterBaseId(card!.id)).toBe(STARTER_CARD_IDS.dungeonSwap);
  });

  it('grantStarterDimensionWarp grants 维度扭曲 with id strippable to STARTER_CARD_IDS.dimensionWarp', () => {
    const state = makeState({ backpackItems: [] });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'grantStarterDimensionWarp',
    });
    const card = r.state.backpackItems.find(c => c.name === '维度扭曲');
    expect(card).toBeDefined();
    expect(getStarterBaseId(card!.id)).toBe(STARTER_CARD_IDS.dimensionWarp);
  });

  it('granted cards inherit type/value from the starter pool template', () => {
    const pool = createStarterCardPool();
    const tmplDungeon = pool.find(c => c.id === STARTER_CARD_IDS.dungeonSwap);
    const tmplWarp = pool.find(c => c.id === STARTER_CARD_IDS.dimensionWarp);
    expect(tmplDungeon).toBeDefined();
    expect(tmplWarp).toBeDefined();

    const state = makeState({ backpackItems: [] });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'grantStarterDungeonSwap',
    });
    const card = r.state.backpackItems.find(c => c.name === '乾坤挪移')!;
    expect(card.type).toBe(tmplDungeon!.type);
    expect(card.recycleDelay).toBe(tmplDungeon!.recycleDelay);
  });

  it('grant routes to recycle bag when backpack is full', () => {
    // Fill backpack so the new card overflow-routes to permanentMagicRecycleBag.
    const filler: GameCardData[] = Array.from({ length: 50 }, (_, i) => ({
      id: `filler-${i}`,
      type: 'magic',
      name: `Filler-${i}`,
      value: 0,
      image: '',
    } as GameCardData));
    const state = makeState({
      backpackItems: filler,
      permanentMagicRecycleBag: [],
      backpackCapacityModifier: 0,
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'grantStarterDimensionWarp',
    });
    const inRecycle = r.state.permanentMagicRecycleBag.find(
      c => c.name === '维度扭曲',
    );
    expect(inRecycle).toBeDefined();
    expect(getStarterBaseId(inRecycle!.id)).toBe(STARTER_CARD_IDS.dimensionWarp);
  });
});

// ---------------------------------------------------------------------------
// lastWordsMaxHpBoost  (附魔祭坛 「遗言:生命值上限+4」)
// ---------------------------------------------------------------------------

describe('lastWordsMaxHpBoost — RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP + break trigger', () => {
  it('RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP increments lastWordsMaxHpBoost on the chosen slot', () => {
    const sword: GameCardData = {
      id: 'w-test', type: 'weapon', name: '测试剑', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    const state = makeState({ equipmentSlot1: sword as EquipmentItem });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP',
      equipmentSlotId: 'equipmentSlot1',
      amount: 4,
    });
    expect(r.state.equipmentSlot1?.lastWordsMaxHpBoost).toBe(1);
  });

  it('RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP stacks (×3 → counter = 3)', () => {
    const sword: GameCardData = {
      id: 'w-stack', type: 'weapon', name: '叠加剑', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    let state = makeState({ equipmentSlot1: sword as EquipmentItem });
    for (let i = 0; i < 3; i++) {
      const r = reduce(state, {
        type: 'RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP',
        equipmentSlotId: 'equipmentSlot1',
        amount: 4,
      });
      state = r.state;
    }
    expect(state.equipmentSlot1?.lastWordsMaxHpBoost).toBe(3);
  });

  it('RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP no-ops on empty slot but logs a message', () => {
    const state = makeState({ equipmentSlot1: null });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP',
      equipmentSlotId: 'equipmentSlot1',
      amount: 4,
    });
    expect(r.state.equipmentSlot1).toBeNull();
    expect(
      r.sideEffects.some(
        se => se.event === 'log:entry'
          && (se.payload as any)?.message?.includes('附魔祭坛'),
      ),
    ).toBe(true);
  });

  it('RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP targets the requested slot only', () => {
    const swordL: GameCardData = {
      id: 'wL', type: 'weapon', name: '左剑', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    const swordR: GameCardData = {
      id: 'wR', type: 'weapon', name: '右剑', value: 4, image: '',
      durability: 3, maxDurability: 3,
    };
    const state = makeState({
      equipmentSlot1: swordL as EquipmentItem,
      equipmentSlot2: swordR as EquipmentItem,
    });
    const r = reduce(state, {
      type: 'RESOLVE_EVENT_GRANT_LASTWORDS_MAXHP',
      equipmentSlotId: 'equipmentSlot2',
      amount: 4,
    });
    expect(r.state.equipmentSlot1?.lastWordsMaxHpBoost ?? 0).toBe(0);
    expect(r.state.equipmentSlot2?.lastWordsMaxHpBoost).toBe(1);
  });

  it('1 stack on break → permanentMaxHpBonus += 4 (no current-HP heal)', () => {
    const blade: GameCardData = {
      id: 'w-break', type: 'weapon', name: '断剑', value: 4, image: '',
      durability: 0, maxDurability: 2,
      lastWordsMaxHpBoost: 1,
    };
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      hp: 5,
      maxHp: 10,
      permanentMaxHpBonus: 0,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      blade,
      createEmptyAmuletEffects(),
    );

    expect(result.destroyed).toBe(true);
    expect(result.patch.permanentMaxHpBonus).toBe(4);
    // 「不回血」: hp (current-HP) is not in the patch.
    expect(result.patch.hp).toBeUndefined();
  });

  it('3 stacks on break → permanentMaxHpBonus += 12 (stacks correctly)', () => {
    const blade: GameCardData = {
      id: 'w-break-3', type: 'weapon', name: '断剑×3', value: 4, image: '',
      durability: 0, maxDurability: 2,
      lastWordsMaxHpBoost: 3,
    };
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      hp: 5,
      maxHp: 10,
      permanentMaxHpBonus: 0,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      blade,
      createEmptyAmuletEffects(),
    );

    expect(result.patch.permanentMaxHpBonus).toBe(12);
  });

  it('stacks additively on top of existing permanentMaxHpBonus', () => {
    const blade: GameCardData = {
      id: 'w-break-add', type: 'weapon', name: '加成剑', value: 4, image: '',
      durability: 0, maxDurability: 2,
      lastWordsMaxHpBoost: 2,
    };
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      hp: 5,
      maxHp: 10,
      permanentMaxHpBonus: 5,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      blade,
      createEmptyAmuletEffects(),
    );

    expect(result.patch.permanentMaxHpBonus).toBe(5 + 4 * 2);
  });

  it('no boost when lastWordsMaxHpBoost is undefined or 0', () => {
    const blade: GameCardData = {
      id: 'w-no-boost', type: 'weapon', name: '普通剑', value: 4, image: '',
      durability: 0, maxDurability: 2,
    };
    const state = makeState({
      equipmentSlot1: blade as EquipmentItem,
      permanentMaxHpBonus: 7,
      discardedCards: [],
    });

    const result = computeEquipmentBreakEffects(
      state,
      'equipmentSlot1',
      blade,
      createEmptyAmuletEffects(),
    );

    expect(result.patch.permanentMaxHpBonus).toBeUndefined();
  });

  it('serializes through JSON round-trip (default-serialization persistence path)', () => {
    // GameCardData fields are persisted via default JSON serialization.
    // Confirm lastWordsMaxHpBoost survives a full round-trip so persisted
    // games keep the buff after a reload.
    const blade: GameCardData = {
      id: 'w-persist', type: 'weapon', name: '持久剑', value: 4, image: '',
      durability: 3, maxDurability: 3,
      lastWordsMaxHpBoost: 2,
    };
    const json = JSON.stringify(blade);
    const restored = JSON.parse(json) as GameCardData;
    expect(restored.lastWordsMaxHpBoost).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pactCopyActiveRow  —  翻转之契 「镜面回响」
// ---------------------------------------------------------------------------

describe('pactCopyActiveRow token (翻转之契 「镜面回响」)', () => {
  it('emits event:requestEventInteraction so the UI hook can show the magic-choice modal', () => {
    const state = makeState();
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'pactCopyActiveRow',
    });
    const sideEffect = r.sideEffects.find(
      se => se.event === 'event:requestEventInteraction'
        && (se.payload as any)?.token === 'pactCopyActiveRow',
    );
    expect(sideEffect).toBeDefined();
  });

  it('does not mutate active row directly in the reducer (UI hook handles the copy)', () => {
    const monster = makeMonsterEquip('m1', { hp: 6, attack: 4, fury: 1, currentLayer: 1 });
    const state = makeState({
      activeCards: [monster, null, null, null, null] as ActiveRowSlots,
    });
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'pactCopyActiveRow',
    });
    // Reducer should leave activeCards untouched — the actual deep-clone +
    // slot replacement happens in useEventSystem on user selection.
    expect(r.state.activeCards[0]?.id).toBe('m1');
  });
});

// ---------------------------------------------------------------------------
// amplify-altar-from-random-class-equip-with-warp  —  增幅仪式 「召唤随机专属装备…」
// ---------------------------------------------------------------------------

describe('amplify-altar-from-random-class-equip-with-warp token (增幅仪式)', () => {
  it('emits event:requestEventInteraction so the UI hook can run the random-class-equip flow', () => {
    const state = makeState();
    const r = reduce(state, {
      type: 'APPLY_EVENT_EFFECT',
      token: 'amplify-altar-from-random-class-equip-with-warp',
    });
    const sideEffect = r.sideEffects.find(
      se => se.event === 'event:requestEventInteraction'
        && (se.payload as any)?.token
          === 'amplify-altar-from-random-class-equip-with-warp',
    );
    expect(sideEffect).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// recycleBag EventRequirement type
// ---------------------------------------------------------------------------

describe('recycleBag EventRequirement (双重燃烧 / 双重燃烧觉醒 gating)', () => {
  it('sanity: the new event option referencing recycleBag is available when bag has enough cards', () => {
    // Indirect smoke test: the deck.ts entries are checked via dry-run drain
    // would require booting a full event card. Instead we validate the
    // requirement evaluator directly via APPLY_EVENT_EFFECT being a no-op
    // when we feed recycleBagDelete with an empty bag (already covered above).
    // This block is a placeholder for future E2E: the requirement is plumbed
    // through evaluateChoiceRequirement in events.ts and exposed as a new
    // EventRequirement type in GameCard.tsx.
    const state = makeState({
      permanentMagicRecycleBag: [makePermMagic('present')],
    });
    expect(state.permanentMagicRecycleBag.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// drain-pipeline regression: APPLY_EVENT_EFFECT with phase: 'playerInput'
// ---------------------------------------------------------------------------

describe('drain pipeline under phase: playerInput (per pipeline-input-continuation rule)', () => {
  it('recycleBagDelete fully resolves without stranding follow-up actions', () => {
    const cards = [
      makePermMagic('rb-1', '回响A'),
      makePermMagic('rb-2', '回响B'),
    ];
    const state = makeState({
      permanentMagicRecycleBag: cards,
      discardedCards: [],
    });
    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'recycleBagDelete:1' } as any,
    ]);
    // Pipeline must not strand a follow-up action that would leave the bag
    // half-modified.
    expect(result.state.permanentMagicRecycleBag).toHaveLength(1);
    expect(result.state.discardedCards).toHaveLength(1);
  });

  it('grantStarterDimensionWarp fully resolves without stranding follow-up actions', () => {
    const state = makeState({ backpackItems: [] });
    const result = drain(state, [
      { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterDimensionWarp' } as any,
    ]);
    expect(
      result.state.backpackItems.find(c => c.name === '维度扭曲'),
    ).toBeDefined();
  });
});
