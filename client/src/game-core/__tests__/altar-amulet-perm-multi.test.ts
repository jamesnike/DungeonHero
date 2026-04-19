import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('附魔祭坛 grantAmuletPerm — multi-amulet flow', () => {
  it('with multiple eligible amulets, defers to UI (modal) instead of auto-applying to any amulet', () => {
    const a1 = {
      id: 'amulet-1', name: '雷击护符', type: 'amulet' as const,
      value: 5, amuletEffect: 'stun-rate-boost' as const,
    };
    const a2 = {
      id: 'amulet-2', name: '弧能之符', type: 'amulet' as const,
      value: 5, amuletEffect: 'flip-zap' as const,
    };
    const a3 = {
      id: 'amulet-3', name: 'Heal Amulet', type: 'amulet' as const,
      value: 5, amuletEffect: 'heal' as const,
    };

    const eventCard = {
      id: 'evt-altar-1',
      type: 'event' as const,
      name: '附魔祭坛',
      value: 0,
      stayIfStacked: true,
      eventChoices: [
        {
          id: 'altar-amulet-perm',
          text: '选择护符赋予 Perm 2',
          effect: 'grantAmuletPerm',
          requires: [{ type: 'amulet' as const, message: '没有已装备的护符' }],
          skipFlip: true,
        },
      ],
    };

    const state = makeState({
      amuletSlots: [a1, a2, a3] as any,
      currentEventCard: eventCard as any,
    });

    const result = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: 'altar-amulet-perm',
      choiceText: '选择护符赋予 Perm 2',
      effectTokens: ['grantAmuletPerm'],
      skipFlip: true,
    });

    // None of the amulets should have been auto-mutated.
    expect((result.state.amuletSlots[0] as any).recycleDelay).toBeUndefined();
    expect((result.state.amuletSlots[1] as any).recycleDelay).toBeUndefined();
    expect((result.state.amuletSlots[2] as any).recycleDelay).toBeUndefined();

    // The reducer must emit an interaction request so the UI opens the picker.
    const requestEvent = result.sideEffects.find(
      e => e.event === 'event:requestEventInteraction',
    );
    expect(requestEvent).toBeDefined();
    expect((requestEvent!.payload as { token: string }).token).toBe('grantAmuletPerm');

    // Event must NOT be auto-completed before the player chooses.
    expect(result.enqueuedActions.find(a => a.type === 'COMPLETE_EVENT')).toBeUndefined();

    // The reducer must remember to come back and finish (pendingEventEffects empty
    // since grantAmuletPerm was the only token).
    expect(result.state.pendingEventEffects).toEqual([]);
  });

  it('player picks the SECOND amulet → only that amulet gets recycleDelay=2', () => {
    const a1 = {
      id: 'amulet-1', name: '雷击护符', type: 'amulet' as const,
      value: 5, amuletEffect: 'stun-rate-boost' as const,
    };
    const a2 = {
      id: 'amulet-2', name: '弧能之符', type: 'amulet' as const,
      value: 5, amuletEffect: 'flip-zap' as const,
    };
    const a3 = {
      id: 'amulet-3', name: 'Heal Amulet', type: 'amulet' as const,
      value: 5, amuletEffect: 'heal' as const,
    };

    const state = makeState({
      amuletSlots: [a1, a2, a3] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'amulet-perm-grant' },
    });

    const result = drain(state, [
      { type: 'RESOLVE_PERM_GRANT', targetCardId: 'amulet-2' } as any,
    ]);

    expect((result.state.amuletSlots[0] as any).recycleDelay).toBeUndefined();
    expect((result.state.amuletSlots[1] as any).recycleDelay).toBe(2);
    expect((result.state.amuletSlots[2] as any).recycleDelay).toBeUndefined();
    expect(result.state.permGrantModal).toBeNull();
  });

  it('player picks the THIRD amulet → only that amulet gets recycleDelay=2', () => {
    const a1 = {
      id: 'amulet-1', name: '雷击护符', type: 'amulet' as const,
      value: 5, amuletEffect: 'stun-rate-boost' as const,
    };
    const a2 = {
      id: 'amulet-2', name: '弧能之符', type: 'amulet' as const,
      value: 5, amuletEffect: 'flip-zap' as const,
    };
    const a3 = {
      id: 'amulet-3', name: 'Heal Amulet', type: 'amulet' as const,
      value: 5, amuletEffect: 'heal' as const,
    };

    const state = makeState({
      amuletSlots: [a1, a2, a3] as any,
      permGrantModal: { sourceCardId: 'event-grant', sourceType: 'amulet-perm-grant' },
    });

    const result = drain(state, [
      { type: 'RESOLVE_PERM_GRANT', targetCardId: 'amulet-3' } as any,
    ]);

    expect((result.state.amuletSlots[0] as any).recycleDelay).toBeUndefined();
    expect((result.state.amuletSlots[1] as any).recycleDelay).toBeUndefined();
    expect((result.state.amuletSlots[2] as any).recycleDelay).toBe(2);
  });
});
