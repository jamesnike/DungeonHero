/**
 * 弹幕护盾 — 完美格挡时将 2 张「魔弹」加入手牌（手牌已满则静默丢弃多余的）
 *
 * 钉死的不变量：
 *   1. knightDeck 里 弹幕护盾 持有 perfectBlockSpawnMissiles: 2，
 *      type='shield', value=2, durability=3, maxDurability=3, armorMax=2, classCard=true。
 *      不带 unique 标识（可重复获得）。
 *   2. 完美格挡（attack ≤ armor）+ 手牌空位 ≥ 2 → 手牌增加 2 张 name='魔弹' 的卡。
 *   3. 完美格挡 + 手牌空位 = 1 → 手牌只增加 1 张「魔弹」，log 提及"少入 1 张"。
 *   4. 完美格挡 + 手牌已满（空位 = 0）→ 手牌不变，log 提及"手牌已满"。
 *   5. 非完美格挡（attack > armor）→ 不生成「魔弹」（不论手牌空位）。
 *   6. 新生成的「魔弹」继承当前 amplifiedCardBonus['魔弹'] 累计（applyAmplifyOnCreate）。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState, HAND_LIMIT } from '../constants';
import { generateKnightDeck } from '@/lib/knightDeck';
import { createRng } from '../rng';
import type { GameState } from '../types';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialGameState(),
    activeCards: [null, null, null, null, null] as ActiveRowSlots,
    combatState: { ...initialCombatState },
    ...overrides,
  };
}

function makeMonster(over: Partial<GameCardData> = {}): GameCardData {
  return {
    id: 'm1',
    type: 'monster',
    name: 'Goblin',
    value: 5,
    hp: 10,
    maxHp: 10,
    attack: 5,
    ...over,
  } as GameCardData;
}

function makeBarrageShield(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'shield-barrage',
    type: 'shield',
    name: '弹幕护盾',
    value: 2,
    image: '',
    armor: 2,
    armorMax: 2,
    durability: 3,
    maxDurability: 3,
    perfectBlockSpawnMissiles: 2,
    ...over,
  } as EquipmentItem;
}

function setupBlockState(
  monster: GameCardData,
  shield: EquipmentItem,
  over: Partial<GameState> = {},
  seed = 1,
): GameState {
  return makeState({
    rng: createRng(seed),
    activeCards: [monster, null, null, null, null] as ActiveRowSlots,
    equipmentSlot1: shield,
    handCards: [],
    combatState: {
      ...initialCombatState,
      engagedMonsterIds: [monster.id],
      currentTurn: 'monster',
      pendingBlock: {
        monsterId: monster.id,
        attackValue: monster.attack ?? monster.value,
        monsterName: monster.name,
      },
    },
    ...over,
  });
}

// Pad the hand up to `len` with disposable filler cards (treasures don't have
// any side-effect on RESOLVE_BLOCK paths).
function fillerCards(len: number): GameCardData[] {
  const out: GameCardData[] = [];
  for (let i = 0; i < len; i++) {
    out.push({
      id: `filler-${i}`,
      type: 'magic',
      name: `Filler ${i}`,
      value: 0,
      image: '',
    } as GameCardData);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1) Knight deck wiring
// ---------------------------------------------------------------------------

describe('弹幕护盾 — knightDeck wiring', () => {
  it('appears in generateKnightDeck with perfectBlockSpawnMissiles: 2 and correct stats', () => {
    const [deck] = generateKnightDeck(createRng(42));
    const card = deck.find(c => c.name === '弹幕护盾');
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.value).toBe(2);
    expect(card?.armorMax).toBe(2);
    expect(card?.durability).toBe(3);
    expect(card?.maxDurability).toBe(3);
    expect((card as any)?.perfectBlockSpawnMissiles).toBe(2);
    expect(card?.classCard).toBe(true);
    expect((card as any)?.unique).toBeUndefined();
    expect(card?.shortDescription).toContain('魔弹');
  });
});

// ---------------------------------------------------------------------------
// 2) Perfect block with full hand room — 2 missiles added to hand
// ---------------------------------------------------------------------------

describe('弹幕护盾 — perfect block with hand room', () => {
  it('attack < armor, hand empty: 2 「魔弹」 added to hand', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeBarrageShield();
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(2);
    expect(bolts.every(c => c.type === 'magic')).toBe(true);

    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('完美格挡：获得 2 张「魔弹」'),
    )).toBe(true);
  });

  it('attack == armor (boundary): still triggers 2 「魔弹」', () => {
    const monster = makeMonster({ id: 'goblin', attack: 2 });
    const shield = makeBarrageShield();
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 3) Perfect block with partial / no hand room — silent overflow drop
// ---------------------------------------------------------------------------

describe('弹幕护盾 — hand-full silent drop', () => {
  it('hand has exactly 1 slot left: only 1 「魔弹」 added, log mentions partial', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeBarrageShield();
    const handLimit = HAND_LIMIT;
    const state = setupBlockState(monster, shield, {
      handCards: fillerCards(handLimit - 1),
    });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(1);
    expect(result.state.handCards).toHaveLength(handLimit);

    expect(result.sideEffects.some(e =>
      e.event === 'log:entry'
        && (e.payload as any)?.message?.includes('完美格挡：获得 1 张「魔弹」')
        && (e.payload as any)?.message?.includes('少入 1 张'),
    )).toBe(true);
  });

  it('hand is full: 0 「魔弹」 added, log mentions hand-full', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeBarrageShield();
    const handLimit = HAND_LIMIT;
    const state = setupBlockState(monster, shield, {
      handCards: fillerCards(handLimit),
    });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(0);
    expect(result.state.handCards).toHaveLength(handLimit);

    expect(result.sideEffects.some(e =>
      e.event === 'log:entry'
        && (e.payload as any)?.message?.includes('完美格挡：手牌已满，「魔弹」未生成'),
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4) Non-perfect block does NOT spawn missiles
// ---------------------------------------------------------------------------

describe('弹幕护盾 — non-perfect block does NOT spawn missiles', () => {
  it('attack > armor: 0 「魔弹」 added even with hand room', () => {
    const monster = makeMonster({ id: 'goblin', attack: 5 });
    const shield = makeBarrageShield();
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5) Spawned 魔弹 inherits amplifiedCardBonus
// ---------------------------------------------------------------------------

describe('弹幕护盾 — spawned 魔弹 inherits amplifiedCardBonus', () => {
  it('amplifiedCardBonus["魔弹"]=3 → newly spawned bolts have amplifyBonus=3', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeBarrageShield();
    const state = setupBlockState(monster, shield, {
      amplifiedCardBonus: { '魔弹': 3 },
    });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(2);
    expect(bolts.every(c => (c as any).amplifyBonus === 3)).toBe(true);
  });

  it('no prior amplification → newly spawned bolts have no amplifyBonus', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeBarrageShield();
    const state = setupBlockState(monster, shield);

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    const bolts = result.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts).toHaveLength(2);
    expect(bolts.every(c => !(c as any).amplifyBonus)).toBe(true);
  });
});
