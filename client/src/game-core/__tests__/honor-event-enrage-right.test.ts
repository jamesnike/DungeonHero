import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('战血荣誉 — right monsters enrage after choice resolves', () => {
  function makeFixture() {
    const eventCard = {
      id: 'evt-honor-1',
      type: 'event' as const,
      name: '战血荣誉',
      value: 0,
      eventChoices: [],
    };
    const monster = {
      id: 'm-right-1',
      type: 'monster' as const,
      name: 'Goblin',
      value: 5,
      hp: 10,
      maxHp: 10,
      attack: 5,
    };
    const activeCards: any[] = [eventCard, monster, null, null, null];
    const state = makeState({
      activeCards: activeCards as any,
      currentEventCard: eventCard as any,
      resolvingDungeonCardId: eventCard.id,
    });
    return { state, eventCard, monster };
  }

  it('option 1 (heal+8, spellLifesteal+1) enrages the right monster via BEGIN_COMBAT', () => {
    const { state, monster } = makeFixture();

    const result = reduce(state, {
      type: 'RESOLVE_EVENT_CHOICE',
      choiceId: '0',
      choiceText: '整理呼吸',
      effectTokens: ['heal+8', 'spellLifesteal+1'],
      skipFlip: false,
    });

    const beginCombat = result.enqueuedActions.find(
      (a: any) => a.type === 'BEGIN_COMBAT' && a.monster?.id === monster.id,
    );
    expect(beginCombat).toBeDefined();
  });

  it('full drain — right monster ends up engaged', () => {
    const { state, monster } = makeFixture();

    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '0',
        choiceText: '整理呼吸',
        effectTokens: ['heal+8', 'spellLifesteal+1'],
        skipFlip: false,
      } as any,
    ]);

    expect(final.state.combatState.engagedMonsterIds).toContain(monster.id);
  });

  it('option 4 (flipToHonorBloodMagic) — right monster engaged after drain', () => {
    const { state, monster } = makeFixture();
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '3',
        choiceText: '战血铭刻',
        effectTokens: ['flipToHonorBloodMagic'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.combatState.engagedMonsterIds).toContain(monster.id);
  });

  it('option 6 (stunCap+10, flipToMonsterAttackDebuff) — right monster engaged', () => {
    const { state, monster } = makeFixture();
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '5',
        choiceText: '强化意志',
        effectTokens: ['stunCap+10', 'flipToMonsterAttackDebuff'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.combatState.engagedMonsterIds).toContain(monster.id);
  });

  it('option 2 (gold+15, openShop) — pauses, then continue resumes — right monster engaged', () => {
    const { state, monster } = makeFixture();
    // First dispatch — should pause at openShop, store remaining tokens
    let after = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '1',
        choiceText: '回收战利品',
        effectTokens: ['gold+15', 'openShop'],
        skipFlip: false,
      } as any,
    ]);
    // Right monster should NOT yet be engaged because openShop pauses processing
    // and stores empty pending; AFTER all tokens, post-effect logic runs.
    // Whether enrage happens before or after openShop interaction depends on order.
    // If openShop is the LAST token, post-effect logic runs immediately after.
    // BUT openShop is interactive, so processing actually pauses without ever
    // reaching the post-effect block.
    // Then user closes shop → CONTINUE_EVENT_EFFECTS dispatched.
    // Resume processing.
    after = drain(after.state, [{ type: 'CONTINUE_EVENT_EFFECTS' } as any]);
    expect(after.state.combatState.engagedMonsterIds).toContain(monster.id);
  });

  it('option 3 (classBottom+3) — right monster engaged', () => {
    const { state, monster } = makeFixture();
    const final = drain(state, [
      {
        type: 'RESOLVE_EVENT_CHOICE',
        choiceId: '2',
        choiceText: '唤醒底牌',
        effectTokens: ['classBottom+3'],
        skipFlip: false,
      } as any,
    ]);
    expect(final.state.combatState.engagedMonsterIds).toContain(monster.id);
  });
});
