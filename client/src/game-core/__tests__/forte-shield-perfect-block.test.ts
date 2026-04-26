/**
 * 砺心之盾 — 完美格挡时永久生命值上限 +1（只抬上限，不回血）。
 *
 * 钉死的不变量：
 *   1. createStarterCardPool() 包含 砺心之盾，type='shield', value=3, durability=2,
 *      maxDurability=2, armorMax=3, shieldPerfectBlockMaxHpGain=1。id = STARTER_CARD_IDS.forteShield。
 *   2. 完美格挡（attack ≤ armor）→ patch.permanentMaxHpBonus += 1，state.hp 不变。
 *      跟「附魔祭坛 遗言：生命值上限+4」语义对齐：cap-only，不附带回血。
 *   3. 非完美格挡（attack > armor）→ permanentMaxHpBonus 不变。
 *   4. 多次完美格挡可叠加（无次数封顶）。
 *   5. 边界：attack == armor 也算完美格挡（armor 被打到 0、durability -1，但 maxHp 仍 +1）。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { initialCombatState } from '../constants';
import { createStarterCardPool, STARTER_CARD_IDS } from '../deck';
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

function makeForteShield(over: Partial<GameCardData> = {}): EquipmentItem {
  return {
    id: 'shield-forte',
    type: 'shield',
    name: '砺心之盾',
    value: 3,
    image: '',
    armor: 3,
    armorMax: 3,
    durability: 2,
    maxDurability: 2,
    shieldPerfectBlockMaxHpGain: 1,
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

// ---------------------------------------------------------------------------
// 1) Starter card pool wiring
// ---------------------------------------------------------------------------

describe('砺心之盾 — starter pool wiring', () => {
  it('createStarterCardPool exposes 砺心之盾 with the expected stats', () => {
    const pool = createStarterCardPool();
    const card = pool.find(c => c.id === STARTER_CARD_IDS.forteShield);
    expect(card).toBeTruthy();
    expect(card?.type).toBe('shield');
    expect(card?.name).toBe('砺心之盾');
    expect(card?.value).toBe(3);
    expect(card?.armorMax).toBe(3);
    expect(card?.durability).toBe(2);
    expect(card?.maxDurability).toBe(2);
    expect((card as any)?.shieldPerfectBlockMaxHpGain).toBe(1);
    expect(card?.shortDescription).toContain('生命值上限');
  });
});

// ---------------------------------------------------------------------------
// 2) Perfect block (attack < armor) → max HP +1, current hp unchanged
// ---------------------------------------------------------------------------

describe('砺心之盾 — perfect block (attack < armor)', () => {
  it('attack < armor: permanentMaxHpBonus +1, current hp unchanged', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeForteShield();
    const state = setupBlockState(monster, shield, { hp: 20, permanentMaxHpBonus: 0 });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    expect(result.state.permanentMaxHpBonus).toBe(1);
    expect(result.state.hp).toBe(20); // current hp not changed (cap-only)
    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('完美格挡：永久生命值上限 +1'),
    )).toBe(true);
  });

  it('boundary: attack == armor still triggers max HP +1 (armor breaks but maxHp gain fires)', () => {
    const monster = makeMonster({ id: 'goblin', attack: 3 });
    const shield = makeForteShield();
    const state = setupBlockState(monster, shield, { hp: 20, permanentMaxHpBonus: 0 });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    expect(result.state.permanentMaxHpBonus).toBe(1);
    expect(result.state.hp).toBe(20);
    // Armor depleted (3 → 0), durability -1 (2 → 1)
    const after = result.state.equipmentSlot1 as GameCardData | null;
    expect(after?.durability).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3) Non-perfect block (attack > armor) → no max HP gain
// ---------------------------------------------------------------------------

describe('砺心之盾 — non-perfect block does NOT grant max HP', () => {
  it('attack > armor: permanentMaxHpBonus unchanged', () => {
    const monster = makeMonster({ id: 'goblin', attack: 5 });
    const shield = makeForteShield();
    const state = setupBlockState(monster, shield, { hp: 20, permanentMaxHpBonus: 0 });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    expect(result.state.permanentMaxHpBonus).toBe(0);
    // No max-HP-gain log entry should be emitted
    expect(result.sideEffects.some(e =>
      e.event === 'log:entry' && (e.payload as any)?.message?.includes('完美格挡：永久生命值上限'),
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4) Stacking across multiple perfect blocks
// ---------------------------------------------------------------------------

describe('砺心之盾 — stacking across multiple perfect blocks', () => {
  it('two consecutive perfect blocks → permanentMaxHpBonus +2', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeForteShield();
    const state = setupBlockState(monster, shield, { hp: 20, permanentMaxHpBonus: 0 });

    const after1 = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    expect(after1.state.permanentMaxHpBonus).toBe(1);

    // Second block: re-arm pendingBlock and reset slotDurabilityUsedThisTurn
    // so the block can run again. armor was not depleted (1 < 3) so the shield
    // is still equipped with armor=2 (3-1).
    const second = makeState({
      ...after1.state,
      combatState: {
        ...after1.state.combatState,
        pendingBlock: {
          monsterId: monster.id,
          attackValue: 1,
          monsterName: monster.name,
        },
        slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 },
      },
    });

    const after2 = reduce(second, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });
    expect(after2.state.permanentMaxHpBonus).toBe(2);
    expect(after2.state.hp).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 5) Cap-only semantics: existing permanentMaxHpBonus is preserved + added to
// ---------------------------------------------------------------------------

describe('砺心之盾 — cap-only semantics, preserves existing maxHp bonus', () => {
  it('existing permanentMaxHpBonus=5 → after perfect block becomes 6, current hp unchanged', () => {
    const monster = makeMonster({ id: 'goblin', attack: 1 });
    const shield = makeForteShield();
    const state = setupBlockState(monster, shield, { hp: 18, permanentMaxHpBonus: 5 });

    const result = reduce(state, { type: 'RESOLVE_BLOCK', choice: 'shield', slotId: 'equipmentSlot1' });

    expect(result.state.permanentMaxHpBonus).toBe(6);
    expect(result.state.hp).toBe(18);
  });
});
