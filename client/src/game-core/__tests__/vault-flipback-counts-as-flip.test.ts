/**
 * 秘藏宝库（已开启）「深入探索（受 4 伤害，翻转回去）」(vault-flipback)
 * — 必须命中所有 7 个 flip-counter 消费方。
 *
 * 历史 bug：vault-flipback 的「替换 active 格」一直是在 hook 层用
 * `UPDATE_ACTIVE_CARDS` 直接做的，绕过了 `applyFlipCounters`，导致选项卡面写
 * 「翻转回去」但 7 个翻转联动（熔炉之心 / 翻印之符 / 翻覆震慑 / 熔铸耐久 /
 * 翻血之符 / 弧能之符 / 生长之盾）全部哑火。
 *
 * 修复：新加 APPLY_VAULT_BACK_FLIP reducer action，把「back-flip + applyFlipCounters」
 * 打成原子步骤；hook 改为只 dispatch 一次本 action，跟其它 6 条 back-flip 路径
 * （乾坤一翻 active back / 乾坤一翻 preview reveal / 血誓回卷 single+multi /
 * 翻转之契 flipAllActiveRow）行为一致。
 */

import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import type { EquipmentItem, ActiveRowSlots } from '@/components/game-board/types';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

/** Build the closed-vault card (matches the structure in `game-core/deck.ts`). */
function makeClosedVault(id = 'vault-1'): GameCardData {
  return {
    id,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    eventChoices: [
      { text: '搜刮遗物', effect: 'drawClass2' },
    ],
    flipTarget: {
      toCard: {
        id: `${id}-flip`,
        type: 'event',
        name: '秘藏宝库（已开启）',
        value: 0,
        eventChoices: [
          { text: '深入探索', effect: 'vault-flipback' },
        ],
      } as GameCardData,
      destination: 'stay',
    },
  } as GameCardData;
}

/** Build the opened-vault card with `_flipBackCard` pointing back to the closed form. */
function makeOpenedVault(id = 'vault-1'): GameCardData {
  const closed = makeClosedVault(id);
  return {
    id: `${id}-flip`,
    type: 'event',
    name: '秘藏宝库（已开启）',
    value: 0,
    eventChoices: [
      { text: '深入探索', effect: 'vault-flipback' },
    ],
    _flipBackCard: closed,
  } as GameCardData;
}

// ---------------------------------------------------------------------------
// Active-row path: vault was opened in the active row
// ---------------------------------------------------------------------------

describe('APPLY_VAULT_BACK_FLIP — active row', () => {
  it('replaces the opened vault with the closed vault in-place', () => {
    const opened = makeOpenedVault('vault-active');
    const active: ActiveRowSlots = [null, null, opened, null, null];
    const state = makeState({ activeCards: active });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    expect(result.state.activeCards[2]?.id).toBe('vault-active');
    expect(result.state.activeCards[2]?.name).toBe('秘藏宝库');
    expect(result.state.activeCards[2]?.flipTarget).toBeDefined();
  });

  it('emits card:flippedInCell for the in-place flip animation', () => {
    const opened = makeOpenedVault('vault-anim');
    const state = makeState({ activeCards: [null, opened, null, null, null] });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    const evt = result.sideEffects.find(e => e.event === 'card:flippedInCell');
    expect(evt).toBeDefined();
    expect((evt!.payload as any).cellIndex).toBe(1);
    expect((evt!.payload as any).fromCard.name).toBe('秘藏宝库（已开启）');
    expect((evt!.payload as any).toCard.name).toBe('秘藏宝库');
  });

  it('triggers 翻印之符 (persuade-on-flip): persuadeAmuletBonus +10% per amulet', () => {
    const opened = makeOpenedVault();
    const amulet: GameCardData = {
      id: 'a-flipprint', type: 'amulet', name: '翻印之符', value: 0,
      amuletEffect: 'persuade-on-flip',
    } as GameCardData;
    const state = makeState({
      activeCards: [opened, null, null, null, null],
      amuletSlots: [amulet] as any,
      persuadeAmuletBonus: 0,
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    expect(result.state.persuadeAmuletBonus).toBe(10);
  });

  it('triggers 熔炉之心 (flip-gold): FLIP_GOLD_REWARD per amulet on every flip', () => {
    const opened = makeOpenedVault();
    const a1: GameCardData = {
      id: 'a-fg1', type: 'amulet', name: '熔炉之心', value: 0,
      amuletEffect: 'flip-gold',
    } as GameCardData;
    const a2: GameCardData = { ...a1, id: 'a-fg2' } as GameCardData;
    const state = makeState({
      activeCards: [opened, null, null, null, null],
      amuletSlots: [a1, a2] as any,
      gold: 100,
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    // FLIP_GOLD_REWARD (4) × 2 amulets = +8
    expect(result.state.gold).toBe(108);
  });

  it('triggers 翻覆震慑 (flipDebuffMonsterId): targeted monster -1 attack', () => {
    const opened = makeOpenedVault();
    const monster: GameCardData = {
      id: 'mon-flip', type: 'monster', name: 'Skeleton', value: 4,
      hp: 5, maxHp: 5, attack: 4, fury: 1, currentLayer: 1,
    } as GameCardData;
    const state = makeState({
      activeCards: [opened, null, monster, null, null],
      flipDebuffMonsterId: 'mon-flip',
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    const updated = result.state.activeCards[2]!;
    expect(updated.attack).toBe(3);
  });

  it('triggers 熔铸耐久 (_flipRepairBuff): equipment durability +1 on flip', () => {
    const opened = makeOpenedVault();
    const sword: EquipmentItem = {
      id: 'w-fr', type: 'weapon', name: 'Sword', value: 2,
      durability: 1, maxDurability: 3,
      _flipRepairBuff: true,
    } as EquipmentItem;
    const state = makeState({
      activeCards: [opened, null, null, null, null],
      equipmentSlot1: sword,
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    expect((result.state.equipmentSlot1 as any)?.durability).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Hand path: vault was triggered from hand (cellIdx === -1)
// ---------------------------------------------------------------------------

describe('APPLY_VAULT_BACK_FLIP — hand (event played from hand)', () => {
  it('adds the closed vault to handCards when the source is not in active row', () => {
    const opened = makeOpenedVault('vault-from-hand');
    const state = makeState({
      activeCards: [null, null, null, null, null],
      handCards: [],
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    expect(result.state.handCards).toHaveLength(1);
    expect(result.state.handCards[0].id).toBe('vault-from-hand');
    expect(result.state.handCards[0].name).toBe('秘藏宝库');
    // No active-row mutation
    expect(result.state.activeCards.every(c => c === null)).toBe(true);
  });

  it('still triggers flip counters when flipping back from hand', () => {
    const opened = makeOpenedVault();
    const amulet: GameCardData = {
      id: 'a-fp', type: 'amulet', name: '翻印之符', value: 0,
      amuletEffect: 'persuade-on-flip',
    } as GameCardData;
    const state = makeState({
      activeCards: [null, null, null, null, null],
      handCards: [],
      amuletSlots: [amulet] as any,
      persuadeAmuletBonus: 0,
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: opened } as GameAction);

    // The vault returned to hand AND the flip amulet fired.
    expect(result.state.handCards).toHaveLength(1);
    expect(result.state.persuadeAmuletBonus).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Edge case: missing _flipBackCard
// ---------------------------------------------------------------------------

describe('APPLY_VAULT_BACK_FLIP — missing _flipBackCard', () => {
  it('is a noop when the card has no _flipBackCard', () => {
    const noFlipBack: GameCardData = {
      id: 'naked', type: 'event', name: '秘藏宝库（已开启）', value: 0,
    } as GameCardData;
    const state = makeState({
      activeCards: [noFlipBack, null, null, null, null],
      gold: 100,
      amuletSlots: [
        { id: 'a-fg', type: 'amulet', name: '熔炉之心', value: 0, amuletEffect: 'flip-gold' } as any,
      ],
    });

    const result = reduce(state, { type: 'APPLY_VAULT_BACK_FLIP', card: noFlipBack } as GameAction);

    // No state change.
    expect(result.state.activeCards[0]).toBe(noFlipBack);
    expect(result.state.gold).toBe(100);
    expect(result.sideEffects).toHaveLength(0);
  });
});
